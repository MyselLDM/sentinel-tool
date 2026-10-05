# External training results - review, verdict, and dataset rationale

Review of the training session recorded in `external_training.md` (NLI cross-encoder vs
contrastive bi-encoder on dataset-v3, `cue_split` for evaluation), plus the rationale for
the dataset decisions behind it.

All comparison figures below are measured on the same data the session used:
`data/cue_split.csv` - **train 622** rows, **test 84** rows (60 malicious, 24 benign).

---

## 1. Results as reported

| metric | NLI (cross-encoder) | contrastive (bi-encoder) | delta |
| --- | --- | --- | --- |
| Accuracy | 0.8929 | 0.9524 | +0.0595 |
| Macro F1 | 0.5822 | 0.9443 | +0.3621 |
| Binary AUC (malicious) | 0.9590 | 0.9924 | +0.0333 |
| Malicious TPR | 0.9000 | 0.9333 | +0.0333 |
| Malicious FPR | 0.1250 | 0.0000 | -0.1250 |

Training budget: both 4 epochs, batch 16. NLI: LR 3e-5, WD 0.02, **622 samples**.
Contrastive: LR 9e-7, WD 0.4, **7,848 triplets**.

---

## 2. The comparison has to be read against the lexical ceiling

This corpus has a measurable trivial baseline: a bag of words (TF-IDF 1-2 grams +
logistic regression) - no syntax, no word order, no notion of purpose. Measured on this
exact split:

```
lexical ceiling: AUC 0.981    TPR at FPR 0% = 78.3%    (style-only: AUC 0.509)
```

So the honest scoreboard is not "NLI vs contrastive" but "NLI vs contrastive vs a
keyword matcher":

| | NLI | contrastive | **bag of words** |
| --- | --- | --- | --- |
| AUC | 0.9590 | **0.9924** | 0.981 |
| TPR at FPR 0% | 90.0% at FPR 12.5% | **93.33% at FPR 0%** | 78.3% at FPR 0% |

Two things fall out:

* **The NLI is below the ceiling** (0.9590 < 0.981). It does not match a keyword matcher
  on this split, so its 0.89 accuracy and 0.90 TPR are not evidence of anything the task
  is meant to measure.
* **The contrastive clears the ceiling** (0.9924 > 0.981). At the operating point it is
  the meaningful result: **TPR 93.33% at FPR 0%, versus 78.3% at FPR 0% for the bag of
  words** - a **+15 point** margin at matched false-positive rate. The AUC margin is
  small (+0.011); the operating-point margin is not.

Any accuracy-style number from this run must be quoted alongside 0.981, or it means
"about as well as a keyword matcher", which is not the claim being made.

---

## 3. Verdict: the NLI is underfit; the contrastive is well-fit

### 3.1 The NLI is underfit

* **Optimisation budget**: 622 rows / batch 16 = ~39 steps per epoch, x4 epochs =
  **~156 optimiser steps**. At LR 3e-5 that is a very small amount of learning.
* **It scores below a bag of words** - the classic signature of underfitting, not of a
  hard task or a bad architecture.
* Its operating point is also poor: TPR 0.90 but with **3/24 false positives**, while the
  bag of words reaches 0.783 at zero false positives.

Evidence in favour of underfitting over any other explanation: the corpus is easily
learnable (the ceiling proves it), the model is large enough, and the only anomalous input
is the step count. The fix is more optimisation - more epochs, or a higher LR with a warmup
that ramps rather than a fixed 0.1 ratio.

### 3.2 The contrastive shows no sign of overfitting

* It beats the ceiling on both AUC and (substantially) at the operating point.
* FPR is 0/24 with TPR 56/60 - a strong, balanced result, not the "memorised the training
  set" pattern.
* Nothing here indicates overfitting. To *confirm* it you would need train-set metrics
  alongside the test ones - the current table has no train/test gap, so a mild degree of
  overfitting cannot be positively excluded, only judged unlikely.

### 3.3 The gap is confounded by the budget - this is the important caveat

At identical epochs and batch size, the two models did **very different amounts of work**:

| | samples seen | steps/epoch | total steps |
| --- | --- | --- | --- |
| NLI | 622 | ~39 | **~156** |
| contrastive | 7,848 triplets | ~490 | **~1,961** |

The contrastive had **~12.6x** the optimisation steps. Since the NLI is underfit, that
difference alone can account for the whole gap. So this run does **not** yet support "the
contrastive architecture is better" - it supports "the contrastive model was trained
roughly 12.6x longer". The 7,848 triplets come from the uncapped cross-product of benign x
malicious rows per goal; the packaged pipeline caps that (`--max-triplets-per-anchor`,
default 64) precisely to keep the two models on a comparable budget.

**Recommended re-run before quoting a winner**: raise the NLI to a comparable budget (its
step count to ~2,000), then compare at equal budget, and report the ceiling next to both.

### 3.4 The test set cannot settle a 2-row difference

84 test rows: TPR 54/60 vs 56/60 is a **2-row difference**, and FPR 3/24 vs 0/24 is a
3-row difference. Neither is statistically distinguishable. Use a paired test (McNemar on
the same 84 rows) and quote the confidence interval - the AUC difference is the more
robust of the reported numbers, and even that rests on 84 rows.

---

## 4. A metric-consistency problem in the reported table

**Macro F1 is not comparable between the two rows, so the "+0.3621" delta is an artifact.**

The test set contains **no neutral rows** (60 malicious + 24 benign). That makes a
3-class macro F1 ill-defined, and the two models appear to have been scored differently:

* **NLI 0.5822 is exactly a 3-class macro with the neutral class at zero support.**
  From its own confusion matrix - TP 54, FN 6, FP 3, TN 21:
  `F1(malicious) = 0.92308`, `F1(benign) = 0.82353`, and
  `(0.92308 + 0.82353 + 0) / 3 = 0.58220`. Matches the reported value to 4 decimal places.
* **Contrastive 0.9443 is exactly a 2-class macro** - the same two classes, no zero-support
  third class: `F1(malicious) = 0.96552`, `F1(benign) = 0.92308`, mean = `0.94430`. Matches
  to 4 decimal places.

So both numbers are internally consistent - but they are **different metrics**. One model
was scored over 3 classes (one of which has no test rows) and the other over 2. The
`+0.3621` delta compares 2-class macro against 3-class macro and is therefore meaningless.

On one consistent scale - **binary macro F1, malicious vs not** - the comparison is:

| | NLI | contrastive |
| --- | --- | --- |
| binary macro F1 (recomputed from TPR/FPR) | **0.8733** | **0.9443** |

delta = **+0.071**, not +0.3621. The contrastive still wins, by a real but far smaller margin.
If Macro F1 is to appear in the write-up, recompute both with one definition
(`average='binary'` with malicious as the positive class, or `average='macro'` restricted
to the classes actually present) and state which.

---

## 5. Is the result good enough?

* **Contrastive: yes, with caveats.** It is the only model that clears the lexical ceiling,
  and by a wide margin at the operating point (+15 points TPR at FPR 0). The caveats are
  that the test set is 84 rows, and that no train-set metrics were reported.
* **NLI: not yet.** Underfit at ~156 steps, and below a bag of words. Re-run at a
  comparable budget before drawing any conclusion from it.
* **The comparison as a whole: not yet.** The budget is not matched (12.6x), and Macro F1
  is not on a common scale. Both are fixable in a short re-run, and both matter more than
  adding data.

---

## 6. Dataset rationale - for the write-up

Two questions were asked: why we did not expand the new dataset, and why we moved away from
the original 9,000-row generated one. Both are answered by measurements, not preference.

### 6.1 Why we moved away from the 9,000-row dataset (`dataset_v2`)

It was large but structurally unable to support the comparison:

1. **The 9,000 was far fewer independent examples than it looked.** Positives collapsed to
   roughly **3.6 distinct verbs re-instantiated 22 times per anchor**: benign-vs-benign
   Jaccard **0.685** (the new corpus is 0.105, the original human corpus 0.095).
2. **Labels stopped matching content.** With near-identical strings on both sides of the
   label - **~42% of cross-label pairs at Jaccard >= 0.75** (the new corpus: **0.03%**) -
   the class boundary was largely noise.
3. **One defect dominated the errors.** A single policy family (P-10, Replay Exploitation)
   accounted for **75% of all errors in both models** - a labelling and representation
   defect, not a capacity limit. It was removed and the corpus renumbered.
4. **It carried label leaks.** 94.9% of generated rows ended with a period versus 0.0% of
   human rows, and because generated rows skew malicious that artefact alone separated two
   of the three classes by ~26 points.
5. **It could not test the thesis question.** It was built so the violation lives in a
   *named scope difference* - exactly what a contradiction detector is good at. It
   therefore favours the NLI by construction and says nothing about purpose-based
   violations.

### 6.2 Why we did not expand the new dataset

1. **The binding constraint was quality, not quantity - measured.** An independent audit of
   the first generated pairs found **only 7 of 22 (32%) valid**; the fix was a **better
   judge model**, not more rows. After regenerating with it, **83 of 94 (88%) validated**,
   independently confirmed at 82/83 by a different model family. More rows with the old
   gate would have produced more defects, not more signal.
2. **Adding rows of the same construction raises the ceiling rather than lowering it.**
   Replacing defective rows with validated ones took the bag-of-words AUC from **0.711 to
   0.981** - i.e. cleaning the corpus made the lexical shortcut *stronger*, because the
   boundary is expressed more consistently. Since the goal is to separate architectures
   *above* that ceiling, more of the same construction moves the target away.
3. **The corpus is already data-saturated.** In the earlier experiments, training on
   **half** the data (4,000 vs 8,000 rows) changed nothing measurable. The models have
   extracted what this corpus contains.
4. **The residual limitation is definitional.** "Unauthorised" is carried by the object
   vocabulary - a *sealed* file, a *commercial* database, the subject's *social media*.
   That is a property of the task, not of the sample size; no amount of additional rows
   removes it. Only test data with genuinely novel vocabulary could, and that is a
   different generation task.
5. **Statistical power is limited by the *test* set, not the training set.** The reported
   differences rest on 84 evaluation rows. Expanding training data would not narrow a
   single one of those intervals.

### 6.3 The one-line version

> The 9,000-row corpus was large but self-defeating: its labels were near-duplicates, one
> defect caused three quarters of all errors, and it measured exactly the skill the NLI
> already has. The replacement was built for *decidability* instead - matched pairs whose
> benign and malicious halves share the concept and the verb and differ only in
> authorisation, gated by an independent judge. We did not expand it because the
> limitation is not volume: a better judge raised pair validity from 32% to 88%, and
> cleaning the corpus *raised* the trivial baseline from 0.711 to 0.981, which is the
> opposite of what more rows would achieve.

---

## 7. Suggested next steps, in order of value

1. **Re-run with a matched budget** (NLI steps raised to ~2,000 to match the contrastive at
   ~1,961). This is the single change most likely to alter the conclusion.
2. **Recompute Macro F1 on one common definition** for both models, and state which.
3. **Report the lexical ceiling (AUC 0.981) next to both models**, every time.
4. **Add train-set metrics** so over/underfitting is visible rather than inferred.
5. **Use a paired test** (McNemar) on the same 84 rows and quote confidence intervals.
6. Only then consider a larger held-out set - and if one is wanted, what is needed is
   **unseen vocabulary**, not more rows of familiar wording.
