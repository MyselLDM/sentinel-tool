# Domain-holdout study - training report

**Location:** `training/per_anchor_split/` (variant of the parent `training/` pipeline)
**Run window:** 2026-10-02 07:36:14 -> 10:11:59 (2 h 36 min, both protocols, unattended)
**Dataset:** `dataset_v2.csv` - 9,000 scenarios, 448 anchors, 9 domains x 50 anchors x 20 rows
**Hardware/stack:** AMD Radeon RX 9060 XT (ROCm), `torch 2.9.1+rocm7.2.1`, `hip 7.2.53211`, bf16 (NLI) / AMP (contrastive)

---

## 1. What we did, and why

A colleague suggested testing **domain transfer** rather than only goal or wording
transfer: hold out an entire service domain, train without it, and see whether the
models still detect violations in a domain they have never seen.

The parent pipeline already had two protocols:

| protocol (parent) | what is unseen |
| --- | --- |
| `group` | unseen **goals** (anchor-grouped CV), same domain mixture |
| `sample` | unseen **wording** (paraphrase holdout), same goals |

This variant adds two more, so each axis can be attributed separately:

| protocol (this variant) | folds | train / fold | test / fold | what is unseen |
| --- | --- | --- | --- | --- |
| `domain` | **9** (leave-one-domain-out) | 8,000 rows (7,960 in 2 folds) | 1,000 rows (one whole domain) | the **domain**; both paraphrase samples kept |
| `domain_sample` | **9** | 4,000 rows (3,980 in 2 folds) | 500 rows | the **domain AND the wording** - trains on `sample_index=0` only, tests on `sample_index=1` of the held-out domain |

Because the corpus is perfectly balanced (9 domains x 50 anchors x 20 rows), the fold
count comes from the data - `--folds` is ignored.

### 1.1 The copy

Per instruction, the pipeline was forked into `training/per_anchor_split/` so the
variant is independently runnable: its own `dataset_v2.csv`, `logs/`, `models/` and
`.output/`. Copied: `common.py`, `train_nli.py`, `train_contrastive.py`,
`compare_models.py`, `analyse_fit.py`, `dataset_v2.csv`, `requirements.txt`,
`README.md`, `.gitignore`, and the run files `run_gpu.{sh,ps1}`, `run_all_gpu.sh`,
`run_protocols_gpu.sh`, `deploy_to_fastapi.{sh,ps1}`, `archive_output.ps1`.
`deploy_to_fastapi.{sh,ps1}` were made to walk up to the repo root so the
one-level-deeper copy still finds `fastapi/`.

### 1.2 A leak we found and fixed before running

Two anchors are shared between domains:

```
'Update the email address associated with a customer account.'        -> Customer Service AND Retail
'Retrieve the complete profile information for a specific customer.'  -> Customer Service AND Retail
```

With a naive leave-one-domain-out split, holding out Customer Service left those
anchors' Retail rows **in training**, so 40 of that fold's 1,000 test scenarios (4%)
had a goal the model had trained on - and the same for Retail. That would have
undermined the entire "unseen domain" claim.

Fix: when a domain is held out, any training row sharing an anchor with the test set
is dropped. Verified after the fix:

```
domain         folds=9  domain-leak=0  ANCHOR-LEAK=0  train sizes={7960, 8000}  test=1000  every row tested once=True
domain_sample  folds=9  domain-leak=0  ANCHOR-LEAK=0  train sizes={3980, 4000}  test=500   every row tested once=True
               folds whose TRAINING set contains a sample_index==1 row: 0
```

The trimmed folds are visible as `train=7960` / `train=3980` in the logs.

### 1.3 How to reproduce

```bash
cd training/per_anchor_split
./run_protocols_gpu.sh                 # detached: domain, then domain_sample
./run_protocols_gpu.sh domain          # or one at a time
tail -f logs/run_protocols.log
cat logs/run_all.status                # running -> domain=0 -> domain_sample=0 -> done
```

Runtimes (measured, 9 folds each):

| protocol | NLI | contrastive | total |
| --- | --- | --- | --- |
| `domain` | 1,214 s (20 min, ~120 s/fold) | 3,653 s (61 min, ~363 s/fold) | 83 min |
| `domain_sample` | 688 s (11 min, ~62 s/fold) | 3,592 s (60 min, ~358 s/fold) | 73 min |

Note the contrastive cost is the **same** in both protocols despite `domain_sample`
using half the rows: the `--max-triplets-per-anchor 64` cap binds either way
(400 anchors x 64 = ~25,500 triplets per fold).

Training configuration (identical for both models and both protocols - the
matched-budget control): 4 epochs, batch 32, seed 42; NLI lr 2e-5 + bf16;
contrastive lr 1e-5, `TripletLoss(cosine, margin 0.5)`, AMP.

---

## 2. Results

### 2.1 Headline: domain transfer costs nothing

Every one of the 9 held-out domains, for both models, in both protocols, stays at
**>= 96.2 F1**. Aggregate (mean +/- std over the 9 folds):

| protocol | model | TPR | FPR | Precision | F1 | adv-paraphrase TPR | explicit-attack TPR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `domain` | **NLI** | **99.51 +/- 0.30** | **1.63 +/- 1.65** | **98.41 +/- 1.59** | **98.95 +/- 0.91** | **99.40 +/- 0.36** | **99.94 +/- 0.16** |
| `domain` | contrastive | 99.27 +/- 0.22 | 2.96 +/- 2.05 | 97.15 +/- 1.93 | 98.19 +/- 0.96 | 99.17 +/- 0.26 | 99.67 +/- 0.41 |
| `domain_sample` | **NLI** | **99.31 +/- 0.40** | **1.18 +/- 1.52** | **98.85 +/- 1.47** | **99.07 +/- 0.82** | **99.19 +/- 0.45** | **99.78 +/- 0.42** |
| `domain_sample` | contrastive | 99.13 +/- 0.38 | 2.44 +/- 1.99 | 97.63 +/- 1.89 | 98.37 +/- 1.02 | 99.00 +/- 0.35 | 99.67 +/- 0.94 |

Pooled confusion over each protocol's test folds:

| protocol | model | TP | FN (missed attacks) | FP (blocked benign) | TN | errors |
| --- | --- | --- | --- | --- | --- | --- |
| `domain` (18,000 examples) | NLI | 8,956 | 44 | 147 | 8,853 | **191 (1.06%)** |
| `domain` (18,000) | contrastive | 8,934 | 66 | 266 | 8,734 | 332 (1.84%) |
| `domain_sample` (9,000) | NLI | 4,469 | 31 | 53 | 4,447 | **84 (0.93%)** |
| `domain_sample` (9,000) | contrastive | 4,461 | 39 | 110 | 4,390 | 149 (1.66%) |

(`domain_sample` pools only the 4,500 `sample_index=1` scenarios, so its denominator
is half.)

### 2.2 The same folds, untrained - the baselines are unusable

Each protocol evaluates the **untrained** base models on the identical folds:

| protocol | model | TPR | FPR | Precision | F1 |
| --- | --- | --- | --- | --- | --- |
| `domain` | NLI (off-the-shelf) | 84.16 | 60.86 | 59.81 | 68.89 |
| `domain` | bi-encoder (untrained) | 97.90 | **93.87** | 51.11 | 67.12 |
| `domain_sample` | NLI (off-the-shelf) | 78.36 | 46.16 | 64.41 | 69.95 |
| `domain_sample` | bi-encoder (untrained) | 98.02 | **93.89** | 51.14 | 67.17 |

The untrained NLI blocks ~half of all benign traffic; the untrained bi-encoder blocks
**almost everything** (FPR ~94%) because an untrained MiniLM cosine has no calibrated
scale. F1 ~67-70 for both, i.e. barely better than a coin flip at the positive rate.

### 2.3 Per-domain (each fold holds out exactly one domain)

`domain` protocol:

| fold | held-out domain | NLI TPR | NLI FPR | NLI F1 | CON TPR | CON FPR | CON F1 | NLI-CON F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Customer Service | 99.20 | 4.30 | 97.49 | 99.60 | 5.70 | 97.03 | +0.47 |
| 1 | Education | 99.80 | 0.60 | 99.60 | 99.00 | 3.20 | 97.92 | +1.68 |
| 2 | Federal | 99.50 | 2.40 | 98.56 | 99.60 | 5.40 | 97.17 | +1.39 |
| 3 | Finance | 99.50 | 0.70 | 99.40 | 99.00 | 0.90 | 99.05 | +0.35 |
| 4 | HR | 99.80 | 0.20 | **99.80** | 99.40 | 0.90 | 99.25 | +0.55 |
| 5 | Healthcare | 99.70 | 0.80 | 99.45 | 99.30 | 1.20 | 99.05 | +0.40 |
| 6 | Insurance | 99.90 | 0.20 | 99.85 | 99.20 | 1.40 | 98.90 | +0.95 |
| 7 | Legal | 99.00 | 0.80 | 99.10 | 99.20 | 1.90 | 98.66 | +0.44 |
| 8 | Retail | 99.20 | 4.70 | 97.30 | 99.10 | 6.00 | 96.64 | +0.67 |

`domain_sample` protocol:

| fold | held-out domain | NLI TPR | NLI FPR | NLI F1 | CON TPR | CON FPR | CON F1 | NLI-CON F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Customer Service | 98.80 | 2.40 | 98.21 | 99.20 | 3.40 | 97.93 | +0.28 |
| 1 | Education | 100.00 | 0.40 | 99.80 | 99.40 | 0.40 | 99.50 | +0.30 |
| 2 | Federal | 99.40 | 2.00 | 98.71 | 99.20 | 3.80 | 97.73 | +0.98 |
| 3 | Finance | 99.20 | 0.00 | 99.60 | 99.40 | 0.20 | 99.60 | -0.00 |
| 4 | HR | 99.60 | 0.20 | 99.70 | 99.60 | 2.20 | 98.71 | +0.99 |
| 5 | Healthcare | 98.80 | 0.20 | 99.30 | 98.40 | 0.80 | 98.80 | +0.50 |
| 6 | Insurance | 99.80 | 0.20 | 99.80 | 99.00 | 0.80 | 99.10 | +0.70 |
| 7 | Legal | 99.00 | 0.40 | 99.30 | 99.40 | 4.00 | 97.74 | +1.56 |
| 8 | Retail | 99.20 | 4.80 | 97.25 | 98.60 | 6.40 | 96.20 | +1.06 |

**The NLI wins 17 of the 18 domain folds** (9/9 in `domain`, 8/9 in
`domain_sample`). The single exception is Finance under `domain_sample`, by
0.0035 pp (99.60 vs 99.60) - a tie for any practical purpose.

### 2.4 Per-policy TPR (mean over the 9 folds)

| policy | name | `domain` NLI | `domain` CON | `domain_sample` NLI | `domain_sample` CON |
| --- | --- | --- | --- | --- | --- |
| P-01 | Obvious Malicious Intent | 100.00 | 99.56 | 99.56 | 99.78 |
| P-02 | **Scope Creep** | **98.33** | **97.11** | **98.00** | **96.89** |
| P-03 | Underspecified Scope | 99.00 | 99.22 | 98.22 | 98.67 |
| P-04 | Data Exfiltration | 99.89 | 99.78 | 100.00 | 99.56 |
| P-05 | Unauthorized Sharing | 99.22 | 99.44 | 99.11 | 99.33 |
| P-06 | Constraint Removal | 100.00 | 100.00 | 100.00 | 100.00 |
| P-07 | Temporal Expansion | 99.89 | 99.44 | 99.78 | 99.33 |
| P-08 | Resource Expansion | 99.56 | 99.44 | 99.56 | 99.11 |
| P-09 | Privilege Escalation | 99.67 | 99.67 | 99.56 | 99.78 |
| P-10 | Compound Violation | 99.56 | 99.00 | 99.33 | 98.89 |

Scope Creep is the weakest policy in all four cells - the same class that was weakest
in the parent's `group`/`sample` protocols.

### 2.5 Threshold stability - the contrastive's one real advantage

The F1-optimal decision threshold, per fold:

| protocol | model | mean | sd | min | max | folds exactly at 0.000 |
| --- | --- | --- | --- | --- | --- | --- |
| `domain` | NLI | 0.650 | 0.423 | 0.015 | 0.995 | 0 / 9 |
| `domain` | contrastive | **0.039** | **0.060** | 0.000 | 0.170 | **6 / 9** |
| `domain_sample` | NLI | 0.614 | 0.395 | 0.030 | 0.995 | 0 / 9 |
| `domain_sample` | contrastive | 0.059 | 0.107 | 0.000 | 0.355 | 3 / 9 |

The NLI's optimal cut-off spans **0.015 to 0.995** across domains - nearly two orders
of magnitude, i.e. it must be recalibrated per domain. The contrastive clusters at
**0.000** (the orthogonal boundary) and is stable to within 0.06.

### 2.6 Epoch curves (F1, mean over folds; epoch 0 = untrained)

| protocol | model | e1 | e2 | e3 | e4 | peak |
| --- | --- | --- | --- | --- | --- | --- |
| `domain` | NLI | 98.81 | **99.10** | 98.98 | 98.95 | e2, then declines |
| `domain` | contrastive | 97.84 | 98.13 | **98.23** | 98.19 | e3 |
| `domain_sample` | NLI | 98.76 | 98.98 | **99.23** | 99.07 | e3, then declines |
| `domain_sample` | contrastive | 97.92 | 97.80 | 98.13 | **98.37** | e4 (monotone) |

The NLI mildly overfits past its peak (a ~0.15-0.2 pp decline by epoch 4); the
contrastive keeps improving. The shared 4-epoch budget is therefore slightly long for
the NLI and about right for the contrastive.

### 2.7 Paired tests (9 folds instead of 5 - materially better power)

**Contrastive vs the off-the-shelf NLI baseline** (RQ3 as framed in the thesis):

| metric | `domain` A vs B | p | `domain_sample` A vs B | p |
| --- | --- | --- | --- | --- |
| TPR | 99.27 vs 84.16 (+15.11) | 0.0024 | 99.13 vs 78.36 (+20.78) | 0.0001 |
| Precision | 97.15 vs 59.81 (+37.34) | <0.0001 | 97.63 vs 64.41 (+33.22) | <0.0001 |
| F1 | 98.19 vs 68.89 (+29.29) | <0.0001 (d_z 17.7) | 98.37 vs 69.95 (+28.41) | <0.0001 (d_z 11.7) |
| FPR | 2.96 vs 60.86 (-57.90) | 0.0001 | 2.44 vs 46.16 (-43.71) | 0.0001 |
| adv-paraphrase TPR | 99.17 vs 84.47 (+14.69) | 0.0022 | 99.00 vs 78.72 (+20.28) | 0.0001 |
| explicit-attack TPR | 99.67 vs 82.89 (+16.78) | 0.0033 | 99.67 vs 76.89 (+22.78) | 0.0002 |

**H0 rejected on all six metrics, in both protocols.** (Note the comparison is
fine-tuning vs no fine-tuning, not architecture.)

**Contrastive vs a fine-tuned NLI** (the fair architecture comparison):

| metric | `domain` CON vs NLI | p (CON greater) | p (NLI greater) | `domain_sample` | p (CON greater) | p (NLI greater) |
| --- | --- | --- | --- | --- | --- | --- |
| TPR | 99.27 vs 99.51 (-0.24) | 0.9422 | 0.0578 | -0.18 | 0.8640 | 0.1360 |
| Precision | 97.15 vs 98.41 (-1.26) | 0.9987 | **0.0013** | -1.22 | 0.9953 | **0.0047** |
| F1 | 98.19 vs 98.95 (-0.77) | 0.9993 | **0.0007** | -0.71 | 0.9988 | **0.0012** |
| FPR | 2.96 vs 1.63 (+1.32) | 0.9986 | **0.0014** | +1.27 | 0.9952 | **0.0048** |
| adv-paraphrase TPR | 99.17 vs 99.40 (-0.24) | 0.9118 | 0.0882 | -0.19 | 0.8497 | 0.1503 |
| explicit-attack TPR | 99.67 vs 99.94 (-0.28) | 0.9306 | 0.0694 | -0.11 | 0.6595 | 0.3405 |

The fine-tuned NLI is **significantly better** on Precision, F1 and FPR at
alpha = 0.05; recall is a statistical tie. The contrastive leads on **nothing**.

---

## 3. Findings

**F1 - Domain transfer is not a problem on this corpus.** Holding out an entire
domain costs essentially nothing versus the parent's unseen-goal protocol:
NLI 99.11 -> 98.95 F1 (-0.16 pp), contrastive 97.97 -> 98.19 (+0.22 pp). *(Parent
figures are a prior observation - see Limitations Sec.4.1.)* All 18 domain holdouts land
at >= 96.2 F1. These models generalise across service domains almost perfectly.

**F2 - The corpus is data-saturated.** `domain_sample` trains on **half** the data
(4,000 rows vs 8,000) and still scores the same or better (NLI 99.07 vs 98.95;
contrastive 98.37 vs 98.19). Halving the training set *and* holding out the paraphrase
sibling costs nothing measurable. Together with F1 (a whole unseen domain is also
free), the residual is not a data-volume or generalisation-coverage problem - the
models have extracted what this corpus contains.

**F3 - Difficulty tracks semantic overlap, not domain familiarity.** The two worst
folds for both models in both protocols are **Retail** and **Customer Service**
(NLI F1 97.30 / 97.49; contrastive 96.64 / 97.03), and their elevated error is almost
entirely **false positives** (FPR 4.3-6.4% vs 0.2-1.4% in every other domain) - false
alarms, not missed attacks. Those are exactly the two domains whose anchors duplicate
each other, i.e. the most semantically generic "customer" goals, whose benign phrasing
most resembles other domains' violations. A domain the model has never seen is
handled fine; a domain whose *benign* text resembles malicious text elsewhere is not.

**F4 - Scope Creep (P-02) is the persistent weak point.** 98.33/97.11 (`domain`) and
98.00/96.89 (`domain_sample`) versus 99-100 for every other policy. It is the one
policy whose definition has no lexical signature ("widen WHICH resource or system"),
which also made it the only class the corpus audit could not gate or measure. This is
now the third independent protocol in which P-02 is last.

**F5 - Threshold stability is the contrastive's genuine win, and it is a deployment
property, not a detection property.** NLI's F1-optimal threshold ranges 0.015-0.995
across domains (sd 0.42); the contrastive's sits at 0.000 in 6/9 folds (sd 0.06).
The contrastive's operating point is the theoretically-motivated orthogonal boundary
and is stable across domains, so it is far easier to deploy at a single global
threshold. This is the "boundary at zero" property predicted in the framework - and
the only metric in this study where the contrastive clearly leads.

**F6 - The epoch budget is slightly mis-set for one model.** NLI peaks at epoch 2-3
and declines (~0.15-0.2 pp) by epoch 4; the contrastive does not peak within 4
epochs. The matched 4-epoch budget is a compromise: a little long for the NLI,
possibly a little short for the contrastive. Deltas are small, but the asymmetry is
worth disclosing in a matched-budget claim.

**F7 - With 9 folds the architecture verdict is firm, and it favours the NLI.** The
contrastive beats the off-the-shelf NLI overwhelmingly (F1 +29 pp, p < 1e-4, d_z 17.7)
but is **significantly behind a fine-tuned NLI** on Precision (p = 0.0013), F1
(p = 0.0007) and FPR (p = 0.0014), with recall a tie. It wins no metric except
threshold stability (F5).

**F8 - The adversarial-paraphrase claim does not materialise.** The adversarial-
paraphrase TPR is 99.40 / 99.17 (`domain`) and 99.19 / 99.00 (`domain_sample`) -
a ~0.2 pp NLI edge - even when the test paraphrase is unseen *and* the domain is
unseen. The surface-form sensitivity the framework predicts is not present on this
corpus, for either architecture.

**F9 - Anchor overlap across domains is a real, small hazard.** 2 anchors (40 rows
each) are shared by Customer Service and Retail; naively, 40 of 1,000 test scenarios
in 2 of 9 folds would have carried a goal seen in training. Fixed with an explicit
guard (F1/Sec.1.2); the affected folds now train on 7,960/3,980 rows.

**F10 - The variant's deploy config is stale by default.** `models/model_config.json`
here was written by the last `compare_models.py`, which had no `--protocol`, so
`protocol_key: "current"` and its thresholds (0.6144 / 0.0589) come from
`domain_sample`. If you ever deploy from this variant, run
`./run_gpu.sh compare_models.py --protocol domain` first.

---

## 4. Limitations

**4.1 The parent `group`/`sample` comparison is a prior observation.** The parent
pipeline's `logs/` and `.output/` are now empty, so the 99.11 / 97.97 F1 figures used
in F1 are cited from the earlier v2 run on this same corpus, not re-derived here.
Reproduce with `cd training && ./run_protocols_gpu.sh group sample` (~2.5 h).
The earlier pipeline reproduced to within 0.05 pp across two runs, so the figures are
reliable, but they are not independently verifiable from the current tree.

**4.2 `domain` and `domain_sample` test sets are not identical.** `domain` tests all
1,000 scenarios of the held-out domain; `domain_sample` tests only its 500
`sample_index=1` rows. Their F1 means are therefore **not directly comparable** -
read `domain_sample` as "the half-data regime", not as a clean measurement of the
wording effect. Isolating wording *within* an unseen domain would need a third variant
(train on sample 0, test on **both** samples of the held-out domain).

**4.3 Test sets are smaller per fold.** 1,000 scenarios (2,000 examples) per fold vs
~1,800 in the parent's 5-fold run, so per-domain F1 has a std of ~1 pp and individual
domain differences should not be over-read.

**4.4 Thresholds are per-fold F1-optimal on the test fold**, as the thesis protocol
specifies. That is optimistic in absolute terms (though applied identically to both
models and both protocols, so the comparison is fair). The `aggregate_fixed_threshold`
block in each log carries the honest fixed-threshold variant.

**4.5 Ground truth is LLM-generated.** The corpus was machine-generated and, in the
shipped metadata, unreviewed; the earlier audit measured ~250 rows with invented
identifiers, an exact positive/negative label collision, and 19% of Compound Violation
rows with fewer than two detectable violation dimensions. The 1-2% error floor is the
same order as that label noise, so the models are likely near the corpus ceiling -
which is consistent with every protocol landing within ~1 pp of the others.

**4.6 No per-example predictions are logged**, so no McNemar test and no exact
re-scoring of the reviewed subset. The paired tests here are fold-level
(n = 9), which is adequate but not the strongest available design.

---

## 5. What this means for the hypothesis

The thesis hypothesis is that a contrastive fine-tuned bi-encoder (the "proposed"
model) should beat NLI on **adversarial paraphrasing** - subtle, surface-preserving
scope expansion that defeats entailment-based detection.

What this study shows:

1. **The failure mode the hypothesis targets does not occur on this corpus.** Both
   architectures score 99.0-99.4% TPR on adversarial paraphrases, including when the
   paraphrase is unseen *and* the domain is unseen. There is no NLI collapse to
   recover from.
2. **Where a gap exists, it favours the NLI.** With 9 folds the fine-tuned NLI is
   significantly better on Precision, F1 and FPR; recall is a tie. The large
   advantage over the *off-the-shelf* NLI (+29 pp F1, p < 1e-4) is entirely a
   fine-tuning effect, not an architecture effect.
3. **The one contrastive advantage is deployability, not detection.** Its
   F1-optimal threshold sits at 0.000 and is stable across domains, versus the NLI's
   0.015-0.995. This confirms the framework's "boundary at zero" prediction, and it
   is a real, reportable contribution - but it is operational, not a detection win.
4. **The corpus, not the model, is the binding constraint.** A whole domain can be
   held out for free; half the training data can be removed for free; error sits at
   the same 1-2% in every protocol. That pattern is the signature of a dataset whose
   decisions are separated by narrow surface cues, which is exactly what the earlier
   corpus audit found.

So the honest reading is: **the hypothesis is not supported on this corpus - not
because the contrastive model is bad, but because the task as constructed does not
separate the two architectures.** The theoretically-motivated claim should be reported
as *not falsified in principle but unobservable here*, with the threshold-stability
result as the contrastive's one demonstrated benefit.

---

## 6. Conclusion

- **Domain generalisation is solved for this task.** Leave-one-domain-out, with zero
  domain or anchor leakage, yields 98.95 F1 (NLI) / 98.19 (contrastive) - statistically
  indistinguishable from the parent's unseen-goal protocol. Domain adaptation is a
  dead end for further thesis effort.
- **The fine-tuned NLI is the better detector**, on every metric except threshold
  stability, across all four protocols now run on this corpus.
- **The contrastive's demonstrated advantage is threshold stability** - a stable,
  theoretically-motivated 0.000 boundary versus a domain-dependent NLI cut-off
  spanning 0.015-0.995. That is the result to write up as the contrastive
  contribution.
- **The corpus is saturated and is the limiter.** Halving the data and holding out an
  entire unseen domain both cost ~0. Any further accuracy must come from the data
  (label quality, the P-02 Scope Creep class, the benign/malicious near-collisions
  in Customer Service and Retail), not from architecture, hyperparameters, or more
  training.
- **Recommended next steps, in order of expected value:** (1) fix P-02 / the benign
  contamination, since it is the single dominant residual class and has no lexical
  signature to train against; (2) treat the Customer Service and Retail overlap as a
  corpus defect to de-duplicate; (3) if an architecture question must be answered,
  log per-example predictions and run McNemar, so the answer rests on 18,000 paired
  decisions instead of 9 fold means.

---

## 7. Artifacts

| path | contents |
| --- | --- |
| `logs/domain/{nli,contrastive,comparison}_results.json` | protocol `domain`: per-fold + aggregate metrics, baselines, epoch curves, paired tests |
| `logs/domain_sample/{...}` | same for protocol `domain_sample` |
| `logs/run_protocols.log`, `logs/run_{domain,domain_sample}.log` | full console logs |
| `logs/{run_all,run_domain,run_domain_sample}.status` | per-step exit codes |
| `logs/RUN_DONE{,_domain,_domain_sample}` | completion markers |
| `models/sentinelagent-nli-finetuned/` | final NLI model trained on all 9,000 rows + `training_stats.json` |
| `models/contrastive-miniLM-e4-b32-lr1e-05-mn64-mrg0.5-raw/` | final contrastive model + `training_stats.json` |
| `models/model_config.json` | merged config - **from `domain_sample`; re-run `--protocol domain` before deploying** |

Environment: AMD Radeon RX 9060 XT, `torch 2.9.1+rocm7.2.1`, `hip 7.2.53211`,
dataset `dataset_v2.csv` (9,000 scenarios / 448 anchors / 18,000 eval examples).
