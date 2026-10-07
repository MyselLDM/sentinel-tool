# Tool-Defense writeup (26-7-10) — consistency changes

Companion to [`Tool-Defense-26-7-10.md`](./Tool-Defense-26-7-10.md). This records every edit made
in the consistency pass, the text each one replaced, and why.

**Rule applied:** Chapters 1–3 present the problem, the literature and the method. They must not
report *findings* or *results* — no measured performance figures, no audit outcomes, and no
justifications phrased as "we rebuilt / changed X because the old data did not suffice". Where a
measured number was doing real work, it was replaced by the *design-level* statement it was
standing in for; the numbers themselves belong in the results/discussion chapter.

**Scope:** Chapter 1 and Chapter 3. **Chapter 2 needed no changes** — its only figures
(SentinelAgent's 13% TPR, Cheng et al.'s ~88% TPR drop, the ServiceNow CVE CVSS 9.3) are cited
prior work, which is what a review of literature is for.

**Kept by request:** the `Patil (2026) 13% TPR` references in Ch1 (lines 184, 200, 204) — cited
prior-work motivation, not our result.

---

## Chapter 1

| Line | The writeup said | Now says | Why |
| --- | --- | --- | --- |
| 188 | "…the full DelegationBench v4 benchmark is not used for evaluation, and the published SentinelAgent results are **not re-measured**." | "…the full DelegationBench v4 benchmark is therefore not used as the evaluation set; instead, its intent-verification (P2) scenarios are retained as an external testing batch that anchors the comparison to the published baseline." | Contradicted §Sources of Data (Ch3), which makes the P2 subset "the sole source of the testing batches… direct comparison against the published baseline". |
| 192 | "…a model that always predicts benign would reach about **62% accuracy** while achieving 0% Recall." | "…a model that always predicts benign would appear accurate while achieving zero recall." | A performance figure in Ch1. The point (accuracy is unusable on this corpus) survives without the number. |
| 196 | "Several limitations affect the interpretation of the **results**… a bag-of-words classifier **was found to** separate malicious and benign records with high accuracy… the **reported values represent best-case operating points**… the cosine similarity… **is not a calibrated probability**." | "Several limitations **bound the interpretation of this study**… Because the decision threshold is selected on the same fold that is used for testing, **the resulting operating points will be optimistic**… the cosine similarity… **is a distance score rather than a calibrated probability**." | Removed the lexical-ceiling **finding** and rephrased the rest as design limitations rather than observed outcomes; also fixed "was ran" → (dropped) and "findings" → "conclusions". |
| 210 | "…a drop-in replacement for SentinelAgent's P2 that **demonstrably raises recall** under adversarial paraphrasing while **maintaining low false positive rates**." | "…**is designed as** a plug-and-play, drop-in replacement for SentinelAgent's P2 that **targets higher recall**… while **keeping false positives low**." | Asserted a result in the Significance section, before the design or any data is described. |

---

## Chapter 3

| Line | The writeup said | Now says | Why |
| --- | --- | --- | --- |
| 410 | "…implemented through **a standard NLI model**… This comparative setup **ensures a clear demonstration of the performance gains achieved**…" | "…implemented through an **off-the-shelf Natural Language Inference (NLI) cross-encoder instance that receives no task-specific training**… **Because both configurations share the same MiniLM backbone, this setup holds model size constant and isolates the effect of the verification architecture**…" | Named the actual baseline (repo: `cross-encoder/nli-MiniLM2-L6-H768`) and replaced the outcome-promising sentence with the design's actual control (model size held constant). |
| 412 | "the study's **three** guiding research questions"; also a missing space in "performance **metrics.To** address". | "the study's **two** guiding research questions"; "metrics. To address". | The Statement of the Problem defines two RQs; the "three" count survives only where three are actually defined (see 479). Fixed the typo. |
| 414 | "…relying **entirely on the established benchmark dataset**." | "…relying on **a fixed, version-controlled corpus**." | Contradicted §Sources of Data (two data sources). |
| 422 | "…constructed **because the original benchmark cannot separate the two architectures**. In the earlier DelegationBench v4 derivative, a malicious subtask differed… only by a named scope change… so **both the baseline and the proposed model scored at their ceiling** and the **labels stopped tracking the content** of the instruction." | "…constructed so that **the violation of authorization resides in the purpose of an operation that reads as ordinary casework rather than in an explicitly named scope change**: a malicious subtask is designed to share its surface vocabulary with its benign sibling and to differ only in whether the operation it describes is authorized." | The flagged pattern — justifying the corpus with a **result** ("the old data failed"). Restated as a design property of the corpus. |
| 426 | "And **it is audited: exact duplicate subtasks number zero, cross-label near-duplicates at a Jaccard similarity**, and the rows of the data undergoes verification from an expert." | "And it is governed by an **explicit construction protocol**: every malicious row carries a verified deciding cue, each benign row is paired with the violation it must not be confused with, and the corpus is screened for duplicate and near-duplicate contradictions before it is used." | Audit *results* in Ch3, plus a sentence left ungrammatical by an earlier partial redaction. Restated as protocol. |
| 428 | "Corpus v3 has a **high lexical ceiling**: a bag-of-words classifier… **reaches a ROC-AUC threshold** on the concept-disjoint evaluation split. …a result in which **both architectures land near the ceiling**…" | "**The study's reporting convention is set by a property of the corpus rather than by the outcome of the experiment**… the primary metrics are reported alongside the margin against that [lexical] control… rather than presenting raw accuracy alone as a measure of success." | Removed the measured ceiling claim (and a sentence whose number had been redacted out, leaving it broken). Kept only the reporting convention the finding motivated. |
| 436 | "Because the corpus contains no neutral examples in the triplet sense, **neutral is a property of the NLI label space, not of the contrastive triplet space**, neutral rows are excluded… **which keeps the three-label head fully populated for the first time**." | "Because \"neutral\" is a property of the NLI label space and not of the contrastive triplet space, neutral rows are excluded… **so the three-label NLI head remains fully populated**." | Fixed a run-on introduced by flattening a parenthetical, and dropped the odd "for the first time". |
| 440 | "…which permitted the same goal to appear in both partitions and **thereby inflated the score**. …because holding out a phrase does not hold out the vocabulary, **only 11.6% of test tokens being unseen either way, and its lexical ceiling is accordingly no lower (0.955 against the concept split's 0.981)**." | "…which permitted the same goal to appear on both sides of a fold. …because holding out a phrase does not hold out the underlying vocabulary." | Removed three hard metrics and an implicit finding ("inflated the score"). |
| 444 | an empty `## ` heading. | *(removed)* | Export artefact (not in the table of contents), same as in `training/Thesis.md`. |
| 475 | "The data… originates from **the DelegationBench version 4 dataset, a curated collection of 516 delegation scenarios spanning 13 U.S. federal government service domains and 10 attack categories**." | "The data… originates from **two related sources: the purpose-based corpus described under Sources of Data… and the retained DelegationBench v4 intent-verification (P2) subset together with the corpus's own held-out partitions**." | Contradicted §Sources of Data (corpus v3 is the training set). |
| 479 | "Research Question 1, which asks for the detection performance of **the baseline NLI model**… Research Question 2, which asks… **the proposed contrastive model**… **Research Question 3**, which asks whether there is a significant difference…" | "Research Question 1, which asks for the detection performance of **the proposed contrastive embedding model**… Research Question 2, which asks whether there is a significant difference between the two architectures…" | Invented a third RQ and swapped RQ1/RQ2. Realigned to the Statement of the Problem and Table 3 (RQ1 = proposed, RQ2 = significance). |
| 481 | "…the evaluation dataset, which is fixed as the **held-out 30 percent evaluation partition of DelegationBench version 4**… the text normalization procedure, which **applies lowercase conversion uniformly**… the random seed used for the **stratified train-test split**…" | "…the evaluation partitions, which are fixed as the **held-out partitions of the purpose-based corpus together with the retained DelegationBench v4 P2 testing batch**… the text normalization procedure… the random seed used for the **goal-grouped cross-validation folds**…" | Stale 30% claim; and "lowercase conversion uniformly" is wrong — the contrastive path preserves case. |
| 489 | "…for the proposed contrastive evaluation, the dataset undergoes a specialized, **Subject Matter Expert (SME)-validated** relational labeling process… Finally, …the authorization labels are… binarized to designate **benign instructions as class 0 and adversarial instructions as class 1**." | "…the records are restructured into training triplets according to the **pair-matched construction described under Sampling Data**… the authorization labels are binarized… by treating **label 0 (contradiction) as malicious and labels 1 (entailment) and 2 (neutral) as benign**." | The SME framing was replaced earlier in §Sampling Data; and the label convention was **inverted** relative to both §Sampling Data and the author's script (`0 = contradiction = malicious`). |
| 491 | "…divided using a **stratified train and test split. Exactly 80%** of the records are allocated to the training partition, while the remaining **20%** are reserved for the evaluation partition." | "…divided into **the partitions described under Sampling Data**: a training split used for optimization under goal-grouped five-fold cross-validation, a frozen holdout, and two cue-disjoint evaluation splits." | Third, conflicting partition story; the pipeline uses four partitions, not an 80/20 split. |
| 493 | "the **80% training partition** is utilized exclusively…" | "the **training partition** is utilized exclusively…" | Follow-on to 491. |
| 495 | "The **held-out thirty percent** evaluation partition is grouped into identical testing batches." | "The **held-out evaluation partitions** are grouped into identical testing batches." | Fourth, conflicting partition story. |
| 513 | Table 3, RQ1 data source: "**DelegationBenchv4 (Triplet Format)**". | "**Held-out corpus and P2 evaluation partitions**". | Stale source name now that corpus v3 is the training corpus. |

---

## Second pass — `System Architecture` (lines 445–465)

A separate verification pass over the System Architecture section, checking every technical claim
against the code. Four were wrong and are corrected below.

| Line | The writeup said | Now says | Evidence |
| --- | --- | --- | --- |
| 447, 453 | "a **two-layer** verification pipeline" / "**two-layer** intent verification" | "an intent-verification pipeline…" / "input acquisition, **intent verification**, and decision output" | The section describes a single model. (The *deployed* gateway does OR-combine two models — `fastapi/app/service.py` `combine_decisions` — but this section is scoped to the new model only.) |
| 457 | "**It passes it to** a contrastive bi-encoder…" | "**Both inputs are passed to** a contrastive bi-encoder…" | Dangling pronoun, leftover from a two-component description. |
| 457 | "malicious subtasks… **produce negative cosine values**. The natural decision boundary therefore **falls at zero**…" | "…pushed away from it, so **the decision boundary is expected to sit near zero**… **The exact operating point, however, is not fixed at zero; it is calibrated on held-out data**…" | `TripletLoss(margin=0.5)` guarantees only `cos(a,p) > cos(a,n) + 0.5`; it does not force negatives below zero. The original claim was empirical (a finding in Ch3), and the deployed threshold is **0.024** (`fastapi/model_config.json`). |
| 461 | "A BLOCK verdict means an **INTENT\_DRIFT** violation is recorded…" | "…a **low-similarity** violation is recorded (internally, a **contrastive\_reject** reason)…" | `INTENT_DRIFT` appears **nowhere** in the repository. The real reason string is `contrastive_reject` (`fastapi/app/service.py`; `express-server/src/services/inference.client.js`). |
| 463 | three artifacts — "the per-fold cross-validation results file", "**the full-dataset evaluation file** … **per-example cosine similarity and catch-or-miss status**", "**a human-readable summary file**" | one artifact — "a single cross-validation results file… the aggregate confusion matrix… the run-level aggregate… The matched NLI run writes an identically structured file" | Both trainers emit exactly two outputs: `logs/<model>_cv_results.json` and `models/<dir>/training_stats.json` (see the `train_contrastive.py` / `train_nli.py` docstrings). No per-example dump exists — `training/review_sheet.py` notes that per-example predictions are unavailable. |

Verified **correct and left unchanged** in the same span: the model (`all-MiniLM-L12-v2`; 384-dim,
12 layers per the deployed `config.json`), both input templates, the L2-normalise + dot-product
cosine, the `cosine < threshold → BLOCK` rule, the 0.0–1.0 F1-optimal sweep with the mean across the
five folds, the evaluation subsets, and the training paragraph.

**Left for you:** line 451, `![][image2]` — an unresolved image placeholder, so Figure 3 will not
render; the binary must be re-inserted from the source document. Minor: line 459 calls the outcome
"a calibrated decision rule" — it is a *tuned* threshold (F1-optimal on held-out folds), which is
worth wording as such if you want it to sit cleanly beside Ch1's "a distance score rather than a
calibrated probability".

---

## Kept, and why

| Item | Decision |
| --- | --- |
| Ch1 184/200/204 — "13% true positive rate (Patil, 2026)" | **Kept** (your instruction): cited prior-work motivation, not our result. |
| Ch1 §Definition of Terms 236 — "516 delegation scenarios spanning ten attack categories and thirteen federal domains" | **Kept**: a definition of the prior-work benchmark, and the place where the full-benchmark scale belongs. |
| Ch2 280 / 306 — ServiceNow CVSS 9.3; Cheng et al. ~88% TPR drop | **Kept**: cited literature. |
| Partition and composition counts (584; 220/251/113; 164 of 190; 110 `near_miss` = 55 pairs; 166 `matched` = 83 pairs; 122 holdout; 622-84 and 643-63 splits) | **Kept**: these describe the dataset and the design, not the outcome, and they were re-verified as accurate (see below). |
| Ch3 428 — the mention of a "bag-of-words classifier" lexical control | **Kept** as a methodological *reporting convention* (no numbers). If you would rather Ch1–3 not even name the control, this sentence can go — say the word. |
| Ch1 186 — "the baseline is a pre-trained MiniLM NLI cross-encoder, **with a version fine-tuned following the P2 procedure reported as a secondary reference**" | **Flagged, not changed.** This introduces a third arm that §Research Design (410) does not mention. The pipeline does compute a fine-tuned-NLI reference (`training/compare_models.py`), so the statement may be correct — but Ch3 describes a two-configuration comparison. Worth reconciling. |

---

## Cross-checks performed

Composition figures were re-derived from `training/dataset-v3/corpus_clean.csv`:

```
rows 584 | label 0/1/2 = 220 / 251 / 113 | source original_190 = 164
stratum: near_miss 110, matched 166  | harm: exfiltration, bias, privilege_escalation, surveillance, corruption
```

All match what Ch1 (188, 190) and Ch3 (424) state. File integrity after both passes: valid UTF-8,
LF endings preserved, 804 lines, and the git diff is confined to Ch1/Ch3 (26 insertions /
27 deletions; the extra five lines are the second pass on `System Architecture`).

## Not covered by this pass

* No changes were made in Chapter 4/5 or the appendices, where the measured results, the lexical
  ceiling, and the threshold values properly belong.
* `training/Thesis.md` was revised separately and already carries a companion
  [`THESIS_METHODOLOGY_CHANGES.md`](../training/THESIS_METHODOLOGY_CHANGES.md). The two documents
  describe the same methodology; if both are kept, they should be kept in sync.
