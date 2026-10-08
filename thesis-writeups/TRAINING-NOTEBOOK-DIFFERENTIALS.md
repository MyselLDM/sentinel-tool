# Training-notebook differentials vs the thesis (Chapters 1–3)

Scope: two groupmate notebooks under `training/training/j_train/`, read against the thesis
(`thesis-writeups/Tool-Defense-26-7-10.md`) and the reference pipeline in `training/`. This is a
**report only** — nothing in the thesis or the notebooks has been changed.

## The headline

**Appendix 2 (Experiment Paper) already encodes the notebook configuration verbatim.**
Chapters 1–3 encode the *reference* pipeline. So "make the thesis match this training
configuration" reduces almost entirely to **reconciling Chapters 1–3 with Appendix 2** — the
protocol, not the hyperparameters, is what differs.

| | Appendix 2 says | Notebooks do | Chapters 1–3 say |
| --- | --- | --- | --- |
| Seed | `SEED = 1` | `SEED = 1` | (not stated) |
| Epochs | `EPOCHS = 4` | `EPOCHS = 4` | "matched four-epoch budget" |
| Batch size | `BATCH_SIZE = 16` | `16` | (not stated) |
| LR / weight decay | `LR = 3e-5`, `WD = 0.02` | notebook 1: `3e-5` / `0.02` ✅ · notebook 2: `9e-7` / `0.4` ❌ | (not stated) |
| Warmup | `WARMUP_STEPS = 0.1` | `0.1` | (not stated) |
| Training split | **622** triplets | **622** (`cue_split` train) | **584** (`corpus_clean`) |
| Evaluation | 84, "across **5 stratified folds**" | 84, **one pass**, no folds | 84, **5-fold grouped by goal** |
| Holdout | 122, "reserved for out-of-fold validation" | 122 | 122, "**never trained on**" |

Appendix 2 also matches the notebook on the metric vocabulary (Recall / Precision / F1, Table 4–5,
**no accuracy**) and on the deployment story (Express `POST /api/evaluate`, `mode: "detailed"`,
SQLite `evaluation_requests`, `rejection_reason ∈ {accepted, nli_reject, contrastive_reject,
both_reject}`, CSV export, fastapi inference service) — all of which check out against the repo.

---

## Part A — the two notebooks (verified facts)

| | `thesis-nli-training.ipynb` | `thesis-nli-contrastive-training.ipynb` |
| --- | --- | --- |
| Cells | 32 (17 md / 15 code) | 32 — same structure |
| Source differences | — | `cell 4`: `LR 3e-5 → 9e-7`, `WD 0.02 → 0.4`; `cell 31`: contrastive threshold `0.4 → 0.5`, precision dropped, output formatted as % |
| Model A (NLI) | **run** | **run** — but retrained at the new `LR`/`WD` |
| Model B (contrastive) | defined, **never executed** (cell 31 has 0 outputs) | **run** |
| Data | `corpus_clean.csv` (584) · `cue_split.csv` (706 = 622 train + 84 test) · `holdout_clean_curated.csv` (122) | same |

**Model A (NLI) results**

| Evaluation | Notebook 1 | Notebook 2 | Reference (`training/training/new_dataset_1/logs/nli_cv_results.json`, epoch 4, 5-fold mean) |
| --- | --- | --- | --- |
| `cue_split` test (84) | acc 82.14 · macroF1 52.26 · TPR 86.67 · FPR 29.17 · P 88.14 · AUC 91.04 | acc 48.81 · macroF1 25.66 · TPR 66.67 · FPR 62.50 · AUC 44.31 | acc 88.34 ±2.95 · TPR 82.41 ±4.24 · FPR 8.13 ±3.38 |
| "Frozen holdout" (122) | acc 99.18 · TPR 100 · FPR 0 · AUC 100 | acc 63.93 · TPR 68.57 · FPR 9.62 · AUC 87.20 | (frozen; not evaluated this way) |

**Model B (contrastive) results — notebook 2 only**, `cue_split` test, fixed threshold 0.5:

| Metric | Contrastive | NLI (same notebook) | Δ |
| --- | --- | --- | --- |
| Accuracy | 85.71 | 48.81 | +36.90 |
| Macro F1 | 84.44 | 25.66 | +58.79 |
| Binary AUC (malicious) | 92.36 | 44.31 | +48.06 |
| Malicious TPR | 80.00 | 66.67 | +13.33 |
| Malicious FPR | 0.00 | 62.50 | −62.50 |

Note the comparison is **not interpretable as written**: the NLI in notebook 2 was retrained with
the contrastive's `LR = 9e-7` / `WD = 0.4` (see Part D.2), so the Δ above measures a broken NLI.

---

## Part B — parameters

**Chapters 1–3 state no numeric hyperparameters at all.** They claim only the *shape* of the
protocol: a "matched four-epoch budget" (Ch3 ¶465), the same budget for both models (Ch1 ¶192), and
a "matched outer protocol — identical dataset, folds, seed, batch size, optimizer and
threshold-selection rule" (Ch3 ¶465), with no values.

**Consequence: the parameter differences need no Chapter 1–3 change.** They are
*repo-default vs notebook* differences (the repo's `train_nli.py` defaults are batch 32, lr 2e-5,
wd 0.01, seed 42, bf16, 5 folds), not thesis violations:

| Parameter | Notebook (both) | Repo default (`train_nli.py`) | In Ch 1–3? |
| --- | --- | --- | --- |
| Batch size | 16 | 32 | no — unstated |
| Learning rate | 3e-5 (nb 1) / 9e-7 (nb 2) | 2e-5 | no — unstated |
| Weight decay | 0.02 / 0.4 | 0.01 | no — unstated |
| Seed | 1 | 42 | no — unstated |
| Precision | fp16 | bf16 | no — unstated |
| Warmup | 0.1 | 0.1 | no — unstated |
| Epochs | 4 | 4 | **yes** — and they agree ✅ |

If you want the thesis to *pin* the configuration, the values to adopt are Appendix 2's
(`SEED = 1, EPOCHS = 4, BATCH_SIZE = 16, LR = 3e-5, WEIGHT_DECAY = 0.02, WARMUP_STEPS = 0.1`), i.e.
notebook 1's — **not** notebook 2's `LR = 9e-7 / WD = 0.4`.

---

## Part C — sampling (the real conflicts)

| # | Ch 1–3 statement | Notebook does | Change to match |
| --- | --- | --- | --- |
| C1 | Ch1 ¶192: "evaluated using **five-fold cross-validation grouped by root goal** and stratified by attack family" | **no folds** — a single pass over the 84-sample test set | Say "a single concept-disjoint evaluation split" and drop the fold/group language |
| C2 | Ch3 ¶465: "5-fold cross-validation whose folds are **grouped on the goal** (`StratifiedGroupKFold`)" | none | same as C1 — or keep the reference protocol and treat the notebook as reduced-scope |
| C3 | Ch3 ¶440: "the **584-row training split**" | trains on the **622-row `cue_split` train side** | 584 → 622 (Appendix 2 already says 622) |
| C4 | Ch3 ¶422/¶426/¶465: training data = `corpus_clean` (584 rows) | `corpus_clean` is **loaded and validated but never trained on** | state that the 622 includes corpus + holdout rows (see D.1) |
| C5 | Ch3 ¶440: "the 122-row frozen holdout is **never trained on**" | **107 of the 122 holdout rows are in the training set** | **do not** write this into the thesis — fix the notebook (D.1) |
| C6 | Ch3 ¶440: "**four** complementary partitions" (584 train · 122 holdout · `cue_split` 622/84 · `cue_split_phrases` 643/63) | two only: `cue_split` (622/84) + holdout (122). `cue_split_phrases` is never opened | drop the phrase-split and/or the 4-partition framing, or state the notebook subset |
| C7 | Ch3 ¶442: testing batches from "the frozen holdout, the **two cue splits**, and the original **DelegationBench v4 P2 subset**" | `cue_split` test + holdout only; no P2 batch | same as C6 |
| C8 | Ch3 ¶440/¶465: threshold "mean of the per-fold F1-optimal cut-offs"; ¶459 sweep 0.0–1.0 | NLI: **argmax**, no threshold. Contrastive: **fixed 0.5** | drop the threshold rule, or add it (D.5) |
| C9 | Ch3 ¶412/¶479: two RQs, RQ2 = one-tailed paired t-test on fold-level metrics | **no folds → no paired test** | drop RQ2's t-test, or add folds (D.4) |

`corpus_clean.csv` and `holdout_clean_curated.csv` do **not** overlap (0 rows), but
`cue_split.csv` = `corpus_clean ∪ holdout` (706 = 584 + 122), re-partitioned:

```
holdout rows in cue_split TRAIN : 107 of 122     (corpus: 515 of 584)
holdout rows in cue_split TEST  :  15 of 122     (corpus:  69 of 584)
```

---

## Part D — metrics

**Vocabulary — no change needed.** The notebook's set {Accuracy, Macro F1, Binary AUC, Malicious
TPR, Malicious FPR, per-class P/R/F1, ROC-AUC OvR, FPR@TPR{90,95,99}} is a superset of the thesis's
{Recall, Precision, F1} plus FPR. Nothing in Ch 1–3 has to move for this. (Appendix 2's Table 4–5
already restricts the *reported* set to Recall/Precision/F1, which is fine.)

**Protocols — deferred, as agreed.** The following are *protocol*, not vocabulary, and are absent
from the notebooks. They are recorded here so they can be dropped in later, not actioned now:

- threshold selection (F1-optimal sweep) and the mean-across-folds deployment rule;
- per-subset recall (`adversarial_paraphrases` / `explicit_attacks`) and `by_policy`;
- fold-level results feeding the one-tailed paired t-test;
- the `cue_split_phrases` robustness split and the DelegationBench v4 P2 external batch.

---

## Part E — chapter-by-chapter: what to change in Chapters 1–3

Legend: **Keep** = leave the thesis, fix elsewhere · **Edit** = rewrite the thesis statement to
match · **Revert** = replace with Appendix 2's wording.

### Chapter 1 — The Problem and Its Setting

| Line | Thesis says | Notebook does | Action |
| --- | --- | --- | --- |
| ¶192 | "five-fold cross-validation grouped by root goal and stratified by attack family, with all fine-tuned models trained under the same budget" | single split, no folds | **Edit** → "…evaluated on a held-out concept-disjoint split, with both models trained under the same budget and the same four epochs." (or **Keep** + descope the notebook) |
| ¶192 | "Accuracy is not used because the corpus is class-imbalanced…" | notebook reports Accuracy prominently | **Keep** — the reported table (Appendix 2) uses Recall/Precision/F1 only; the notebook's extra columns are diagnostics |
| ¶188 | "The full DelegationBench v4 benchmark is therefore not used as the evaluation set; instead, its intent-verification (P2) scenarios are retained as an external testing batch…" | P2 batch never used | **Edit** → either keep and add the P2 batch to the notebook, or say the P2 subset is retained as the *source* of the intent-verification scenarios |
| ¶188 | corpus "584 records … 220 malicious and 364 benign … 164 were retained as seed records" | trained on 622 | **Keep the composition** (it describes `corpus_clean`); **Edit** only if you also restate the training split |
| ¶196 | limitations (no metrics after the previous pass) | — | **No change** |
| ¶210 | significance | — | **No change** |

### Chapter 2 — Review of Literature and Studies

**No change.** No training configuration is asserted; the only numbers are cited prior work
(Patil 13 % TPR, Cheng ~88 % TPR drop, CVSS 9.3).

### Chapter 3 — Methodology

| Line / section | Thesis says | Notebook does | Action |
| --- | --- | --- | --- |
| ¶410 Research Design | two configurations, model size held constant | same | **No change** |
| ¶412 | RQ1 = proposed performance; RQ2 = one-tailed paired t-test on fold-level metrics | no folds → no paired test | **Edit** → drop the t-test from RQ2, or add folds to the notebook |
| ¶422 Sources of Data | corpus v3 = 584 training rows, 122 held out | 584 loaded, not trained on | **Edit** → "584 rows in the corpus, of which 622 training triplets are drawn (corpus + repurposed holdout rows)…" — careful: see D.1 |
| ¶426 | "164 of the 584 training rows are the original seed" | — | **No change** (composition fact) |
| ¶428 | reporting convention / lexical control | — | **No change** (no numbers) |
| ¶432 | preprocessing: periods stripped corpus-wide | corpus already has none (verified: 0 of 706 rows end with ".") | **No change** |
| ¶434 | NLI template "with both **fields lowercased**" | lowercases **only the first character** | **Keep the thesis** — the deployed `fastapi/app/preprocess.py` does `.lower()`, so the notebook is the outlier (D.3) |
| ¶436–438 | triplet construction; binarisation 0 = malicious | matches | **No change** |
| ¶440 | four partitions (584 · 122 · 622/84 · 643/63), group-stratified folds | two partitions (622/84 · 122), no folds | **Edit** → single concept-disjoint split + frozen holdout (C1/C2/C6) |
| ¶442 | testing batches incl. two cue splits + P2 | `cue_split` test + holdout | **Edit** (C7) |
| ¶459 System Architecture | threshold swept 0.0–1.0, mean of per-fold F1-optimal | argmax (NLI) / fixed 0.5 (contrastive) | **Edit** → "the decision threshold is calibrated empirically across folds" (Appendix 2's wording) or add the sweep |
| ¶465 | "matched outer protocol — identical dataset, folds, seed, batch size, optimizer and threshold-selection rule, with a matched four-epoch budget…"; "deployment threshold is the mean of the per-fold F1-optimal cut-offs" | same seed/epochs/batch, but **no folds**, **no threshold rule**, and a **shared** `LR`/`WD` across both models | **Edit** → add Appendix 2's explicit hyperparameter set and drop "folds"/"threshold-selection rule" (or add them); **Keep** "four-epoch budget" ✅ |
| ¶475 Research Instrument | data from corpus v3 + P2 + held-out partitions | `cue_split` + holdout | **Edit** (C3/C7) |
| ¶479 | RQ mapping (RQ1 proposed, RQ2 significance) | no folds | **Edit** if RQ2's test is dropped |
| ¶481 | controlled variables: "the random seed used for the goal-grouped cross-validation folds" | seed exists; **no folds** | **Edit** → "the random seed used for the data partition" |
| ¶491–495 Data Generation | "the training partition", "the held-out evaluation partitions" | 622 train / 84 test / 122 holdout | **Edit** → name 622 / 84 / 122 explicitly (Appendix 2 already does) |
| ¶513 Table 3 | RQ1 source "held-out corpus and P2 evaluation partitions" | `cue_split` test | **Edit** → "concept-disjoint evaluation split (84)" |

**Minimal-change summary for Ch 1–3**, if you only want consistency with the notebook *and* with
Appendix 2: ¶192 (drop the fold claim), ¶412 (drop/soften the t-test), ¶422/¶440/¶442/¶475/¶481/¶491–495
(584→622, one split + holdout, drop `cue_split_phrases` + P2), ¶459/¶465 (threshold rule + explicit
hyperparameters). Everything else stays.

---

## Part F — defects in the notebooks that must **not** be written into the thesis

1. **Frozen-holdout leakage.** The notebooks train on `cue_split`'s train side (622), which contains
   **107 of the 122** "frozen holdout" rows — in direct conflict with the notebooks' own markdown
   (cell 21: *"NOT used during training, tuning, or model selection"*) and with Ch3 ¶440. It is why
   notebook 1 reports holdout acc 99.18 / TPR 1.0 / FPR 0.0. **Fix the notebook** (train on
   `corpus_clean` = 584, or drop the holdout rows from the training partition) — the thesis claim is
   the correct one.
2. **One global `LR` / `WEIGHT_DECAY` for both models.** `cell 4` feeds both `cell 12` (NLI) and
   `cell 29` (contrastive). Tuning them for the contrastive (`9e-7` / `0.4`) silently retrained the
   NLI at those values — collapsing it from acc 82.14 to **48.81** and making notebook 2's
   headline comparison meaningless. The repo is explicit that LR/margin are **per-model**
   (`training/README.md`), and Ch3 ¶465 promises a "matched outer protocol" with per-model loss.
   **Fix the notebook**, don't encode this in the thesis.
3. **NLI casing.** `build_nli_pairs` lowercases only the first character
   (`goal[0].lower() + goal[1:]`), while the author's `format_for_nli` and the deployed
   `fastapi/app/preprocess.py` call `.lower()` on the whole string. **214 of 706** rows produce a
   different hypothesis (`...the VA health system` vs `...the va health system`; also `DD-214`,
   `W-2`). Training on a different input distribution than the one served is a defect, not a spec.
4. **No folds, no threshold sweep.** The thesis's RQ2 (paired t-test) and the deployment threshold
   both need folds. The notebooks have none.
5. **Contrastive protocol drift.** TripletLoss at the library-default margin (deployed: `0.5`),
   uncapped triplets (7,848 total; repo caps at 64/anchor), and an evaluation threshold hard-coded
   to 0.5 (deployed: fold-mean ≈ 0.024).

---

## Part G — if you would rather adopt the notebook configuration as canonical

Then the thesis changes shrink to a consistent, mechanical set (and Appendix 2 is already correct):

1. **Ch1 ¶192 / Ch3 ¶412, ¶465, ¶481** — remove every mention of 5-fold / grouped-by-goal folds and
   of the paired t-test; replace with "a single held-out concept-disjoint evaluation split".
2. **Ch3 ¶422, ¶440, ¶442, ¶475, ¶491–495, ¶513** — replace "584-row training split" with
   "622 training samples drawn from `cue_split`", drop `cue_split_phrases` and the P2 testing batch,
   and name the 84-sample evaluation split and 122-row holdout explicitly.
3. **Ch3 ¶459, ¶465** — replace the F1-optimal/mean-of-folds threshold rule with Appendix 2's
   "calibrate decision thresholds empirically across cross-validation folds".
4. **Ch3 ¶465** — add the explicit set `SEED = 1, EPOCHS = 4, BATCH_SIZE = 16, LR = 3e-5,
   WEIGHT_DECAY = 0.02, WARMUP_STEPS = 0.1`, and note it is per-model for the contrastive.
5. Leave **Ch1 ¶188, ¶192 (accuracy), ¶196, ¶210** and all of **Ch2** untouched.

Even in this path, defects **F.1, F.2, F.3** must be fixed in the notebooks — they are errors, not
specification.

---

## Verification

```bash
# notebook config + results
python -c "import json;nb=json.load(open('training/training/j_train/thesis-nli-training.ipynb'));print(''.join(nb['cells'][4]['source']))"
python -c "import json;nb=json.load(open('training/training/j_train/thesis-nli-contrastive-training.ipynb'));print(''.join(nb['cells'][4]['source']))"

# the leakage
python -c "
import csv
K=lambda p:{(r['goal'].strip(),r['subtask'].strip()) for r in csv.DictReader(open(p,encoding='utf-8'))}
h=K('training/dataset-v3/holdout_clean_curated.csv'); c=K('training/dataset-v3/cue_split.csv')
tr={k for r in csv.DictReader(open('training/dataset-v3/cue_split.csv',encoding='utf-8')) if r['cue_split']=='train' for k in [(r['goal'].strip(),r['subtask'].strip())]}
print('holdout rows in cue_split train:', len(h&tr), 'of', len(h))"

# reference pipeline numbers
python -c "
import json;d=json.load(open('training/training/new_dataset_1/logs/nli_cv_results.json'))
print('config:', d['config']); print('final_threshold:', d['final_threshold'])
print('epoch-4 mean:', d['aggregate_curve'][-1])"
```

Reference anchors: Appendix 2 ¶695–697 (622 / 84 × 5 folds / 122; `SEED=1, EPOCHS=4,
BATCH_SIZE=16, LR=3e-5, WEIGHT_DECAY=0.02, WARMUP_STEPS=0.1`); Ch1 ¶192; Ch3 ¶412, ¶440, ¶459, ¶465,
¶481, ¶513; `training/README.md` (repo defaults, per-model LR); `fastapi/app/preprocess.py`
(`format_nli`); `training/training/new_dataset_1/logs/nli_cv_results.json`.
