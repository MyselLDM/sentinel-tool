# Thesis methodology — revision notes (what changed, and why)

Companion to the edit made in [`Thesis.md`](./Thesis.md). `Thesis.md` was rehydrated to the
latest version, but its Methodology chapter described a system and a dataset that no longer
match the code in this repository. This document records every change made to that chapter,
the rehydrated text it replaced, and the file in this repo that is the evidence for the new
wording.

**Scope of the edit.** Inside `training/Thesis.md`, from

```
# **Chapter 3** **METHODOLOGY** {#chapter-3-methodology}
```

up to **but not including**

```
## **Research Instrument** {#research-instrument}
```

That covers `Research Design`, `Sources of Data`, `Sampling Data`, an empty stray `##`
heading, and the *training* paragraph of `System Architecture`. Nothing before Chapter 3 and
nothing from `Research Instrument` onward was touched.

**Sources of truth used** (every "rewritten to" cell below traces to one of these):

| Source | What it fixes |
| --- | --- |
| `training/old-training/sentinelagent_nli_finetune.py` | the **original** DelegationBench v4 P2 set — the author's own script, 200 scenarios, 12 goals, 3-class labels. The retained *testing-batch* source. |
| `training/dataset-v3/DATASET_V3.md` + `training/dataset-v3/*.csv` | corpus v3: the training corpus and its splits (584 / 122 / 622-84 / 643-63). |
| `training/training/new_dataset_1/common.py` | the live constants: `DATASET_PATH = corpus_clean.csv`, `HOLDOUT_PATH`, `CUE_SPLIT_PATH`. |
| `training/README.md` | the matched-budget control, the group-stratified folds, the threshold rule. |
| `fastapi/app/service.py`, `fastapi/app/preprocess.py` | inference framing and the decision rule. |
| `data-gen/AUDIT_LOG.md`, `data-gen/AUDIT_REPORT.md` | corpus-v3 provenance, gates and the lexical-ceiling measurement. |

---

## 1. Differentials at a glance

| # | Area | Rehydrated thesis said | Rewritten to match | Evidence |
| --- | --- | --- | --- | --- |
| 1 | **Baseline definition** | "a standard NLI model" (unspecified) | An off-the-shelf NLI cross-encoder that receives **no task-specific training** | `fastapi/app/models.py` (`DEFAULT_NLI_BASE = cross-encoder/nli-MiniLM2-L6-H768`) |
| 2 | **Proposed-model definition** | "a MiniLM-based contrastive embedding model" | `all-MiniLM-L12-v2`, a 12-layer bi-encoder producing 384-dim embeddings, fine-tuned on **purpose-based** triplets | `training/README.md`; `fastapi/app/service.py` |
| 3 | **Research questions** | "the study's **three** guiding research questions", then names RQ1 and RQ2 only | "**two** guiding research questions" (matches the Statement of the Problem) | `Thesis.md` §Statement of the Problem (Q1, Q2) |
| 4 | **Reporting rule** | absent | New paragraph: report every accuracy figure **against the lexical control**; foreground threshold stability / calibration / FPR | `training/dataset-v3/DATASET_V3.md` §4 |
| 5 | **Data sources** | **One** source — DelegationBench v4 — described as the *sole* dataset used for both training and evaluation | **Two** sources: DelegationBench v4 P2 (**testing batches only**) + corpus v3 (**training** + primary evaluation partitions) | `old-training/sentinelagent_nli_finetune.py`; `dataset-v3/DATASET_V3.md` |
| 6 | **Benchmark size** | 516 scenarios / 10 attack categories / 13 domains, then a 200-scenario subset | Dropped from this section (it is still defined in §Definition of Terms); the P2 subset is described as **200 scenarios / 12 domains / 60 malicious + 140 benign** | §Definition of Terms; Appendix 1; author's script |
| 7 | **Why this data** | Justified DelegationBench v4 as sole source | Justifies corpus v3 as the **training** source (the earlier derivative could not separate the architectures) and keeps DelegationBench v4 P2 for the external comparison | `training/dataset-v3/DATASET_V3.md` §1; `data-gen/AUDIT_REPORT.md` |
| 8 | **Preprocessing** | generic normalisation, no template | lowercasing for the NLI path; **case preserved** for the contrastive path; trailing sentence periods stripped (they leaked the label) | `fastapi/app/preprocess.py`; `dataset-v3/DATASET_V3.md` §6.5 |
| 9 | **Label binarisation** | "benign instructions as class **0** and malicious as class **1**" | "label **0** (contradiction) is **malicious**; labels 1 (entailment) and 2 (neutral) are benign" | `old-training/sentinelagent_nli_finetune.py` (label map + docstring) |
| 10 | **NLI input** | "a standard sentence pair" | The exact premise/hypothesis template used at inference, lowercased | `fastapi/app/preprocess.py` `format_nli` |
| 11 | **Contrastive input** | "restructure the records into training triplets" | The raw `Goal: {goal}. Subtask: {subtask}.` template on **both** sides, casing preserved | `fastapi/app/service.py` `evaluate_contrastive` |
| 12 | **Triplet labels** | "a dedicated data labeling *(validated by a subject matter experts)* stage" | Negatives drawn preferentially from the `near_miss` / `matched` `pair_id` pairs; neutral excluded from the triplet space; validation = the corpus's verified `cue` + audit gates | `dataset-v3/DATASET_V3.md` §3, §5 |
| 13 | **The split** | "a stratified **80/20** train-test split" — then, two paragraphs later, "the held-out **30%** evaluation subset" | Four complementary partitions: 584-row train under **5-fold group CV by goal**; 122-row frozen holdout; concept-disjoint `cue_split` (622/84, primary); phrase-held-out `cue_split_phrases` (643/63, robustness) | `dataset-v3/DATASET_V3.md` §3; `new_dataset_1/common.py` |
| 14 | **Cross-validation** | "5-fold **stratified** cross-validation" (label-only) | **`StratifiedGroupKFold`** — stratified by attack family, **grouped by goal** so no goal straddles a fold | `training/README.md` (paired evaluation) |
| 15 | **Testing batches** | "constructed exclusively from the held-out 30% evaluation subset" | Held-out data only — frozen holdout + both cue splits + the **original DelegationBench v4 P2 subset** — never the training split | author's script; `dataset-v3/DATASET_V3.md` §3 |
| 16 | **System Architecture — training paragraph** | "200 verifiable delegation scenarios"; "a configurable number of LLM paraphrases per goal"; "5-fold stratified CV with a validation hold-out" | corpus v3 (584 rows), near-miss/matched hard negatives, group-by-goal 5-fold CV, **matched four-epoch budget**, threshold = mean of per-fold F1-optimal cut-offs | `training/README.md`; `new_dataset_1/common.py` |
| 17 | **Stray heading** | an empty `## ` heading between `Sampling Data` and `System Architecture` | removed (export artefact; not in the table of contents) | `Thesis.md` table of contents |

---

## 2. The three changes that matter most

**(a) The label convention was inverted (row 9).** The rehydrated chapter said benign = class `0`
and malicious = class `1`. The original author's script — the reference implementation — uses
`0 = contradiction (malicious), 1 = entailment, 2 = neutral`. The whole evaluation rests on which
class is the positive, so the chapter now states the script's convention explicitly.

**(b) The train/test split was internally contradictory and no longer describes the pipeline
(rows 13–15).** The chapter prescribed a "stratified 80/20" split and, two paragraphs later,
"the held-out 30% evaluation subset" — two different numbers for the same partition. The pipeline
does not use a single split at all: it uses a clean 584-row training file, a **frozen** 122-row
holdout that is never trained on, and two concept-disjoint evaluation splits, with folds grouped
by goal so that no goal leaks across the boundary. All four are now described, and both 80/20 and
30% are gone.

**(c) The training data is not the benchmark (rows 5, 7, 16).** The chapter treated DelegationBench
v4 as the sole dataset for both training and evaluation. In reality the benchmark's intent-
verification subset is retained as the **external testing-batch** source (a reproducible reference
to the published baseline), while training now runs on corpus v3 — a purpose-based corpus built
specifically because the earlier DelegationBench v4 derivative could not separate the two
architectures (its negatives differed only by a named scope, so both models sat at their ceiling).

---

## 3. Deliberately preserved

* **The rest of `System Architecture`** (the inference flow, the threshold sweep, the measurable
  outputs). This section is about the architecture being *introduced*, and its text already matches
  what was built — the two-sided `Goal: {goal}. Subtask: {subtask}.` framing, the `all-MiniLM-L12-v2`
  bi-encoder, the cosine-vs-threshold decision, the 5-fold threshold sweep, the per-fold results
  files. Only its closing *training* paragraph was stale.
* **The research framing** — RQ1 (detection performance of the proposed model), RQ2 (one-tailed
  paired-sample t-test), the TPR/Precision/F1 metric set, and the offline/simulation design. These
  are unchanged; only the data and the pipeline behind them are now accurate.
* **H1 / H0, the ethical-considerations section, and everything from `Research Instrument` onward.**
* **The author's DatasetBench v4 attribution** — the permission/MIT-license sentence, the 12-goal
  catalog, and the recognition that the *testing* data comes from the author's published script.

---

## 4. Not changed, but flagged (outside the assigned edit region)

These are inconsistencies that live **after** `Research Instrument`, so they were left untouched.
They will need reconciling before the chapter reads as a whole:

1. **`Research Instrument`** still says "the study's **three** research questions", and repeats the
   "516 scenarios / 13 domains / 10 attack categories" description and a "held-out **30 percent**
   evaluation partition". These should be aligned to the two-RQ framing and the four-partition
   split now used in §Sampling Data.
2. **`Data Analysis` Table 3** lists "DelegationBenchv4 (Triplet Format)" as the RQ1 data source;
   with corpus v3 as the training corpus this should name the actual evaluation partitions.
3. **Appendix 1** says the subset is "60 malicious to **130** benign", while §Sources of Data,
   §Definition of Terms and the author's script all give **140** benign (70 entailment + 70 neutral).
   The Appendix figure looks like a transcription slip.
4. **`Sources of Data` no longer states the full-benchmark size (516 / 13 / 10).** That definition
   still lives in §Definition of Terms, so nothing was lost — but if the chapter is meant to
   introduce the benchmark's scale here rather than only the P2 subset, that sentence can be
   reinstated ahead of the P2 description.

---

## 5. Standing caveat carried into the chapter

Corpus v3 has a **high lexical ceiling**: a bag-of-words classifier (TF-IDF 1-2 grams + logistic
regression — no syntax, no word order, no notion of purpose) reaches **ROC-AUC 0.981** on the
concept-disjoint split. That number is now stated in §Sources of Data and §Research Design, because
it governs how every result may be phrased: an accuracy near the ceiling is *not* evidence that the
corpus separates the two architectures, and the defensible signals are the margin above the lexical
control plus threshold stability and calibration. See `training/dataset-v3/DATASET_V3.md` §4 and
`data-gen/AUDIT_REPORT.md` for the measurements.

---

## 6. How to verify this edit

```bash
# the edited region is exactly this span
sed -n '/^# \*\*Chapter 3\*\*/,/^## \*\*Research Instrument\*\*/p' training/Thesis.md

# the two data facts the chapter now states
head -1 training/dataset-v3/corpus_clean.csv                       # header of the training corpus
python -c "import csv; c=lambda p: sum(1 for _ in csv.DictReader(open(p))); print('train', c('training/dataset-v3/corpus_clean.csv'), '| holdout', c('training/dataset-v3/holdout_clean_curated.csv'))"
python -c "import csv,collections; [print(f, collections.Counter(r['cue_split'] for r in csv.DictReader(open('training/dataset-v3/'+f)))) for f in ('cue_split.csv','cue_split_phrases.csv')]"

# the retained testing-batch source, and its label convention
grep -n "label = 0\|0=contradiction\|target distribution" -i training/old-training/sentinelagent_nli_finetune.py
```
