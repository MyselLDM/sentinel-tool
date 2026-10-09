# **Methodology**

## **MODEL**
Train and compare two intent-verification configurations:
**(1) Baseline NLI Cross-Encoder**
– off-the-shelf `cross-encoder/nli-MiniLM2-L6-H768`, a 3-class softmax head (contradiction / entailment / neutral) with no task-specific training (Patil, 2026).
**(2) Proposed Contrastive Bi-Encoder**
– fine-tuned `all-MiniLM-L12-v2` (12-layer MiniLM, 384-dimensional) that scores a goal \(\leftrightarrow\) subtask pair by cosine similarity.
Deployment serves both fine-tuned arms and blocks a subtask if **either** rejects it.

## **DATA SOURCES**
Use two datasets for model development:
**(1) DelegationBench v4 — P2 intent-verification subset**
– by (Patil, 2026); 200 verifiable delegation scenarios over a fixed catalog of 12 U.S. federal service goals (60 malicious, 140 benign). Retained as the external testing batch.
**(2) Purpose-based corpus v3**
– 584 training rows plus 122 held-out rows over the same 12 goals; the violation lives in the *purpose* of an otherwise plausible operation, with `near_miss` / `matched` benign-sibling pairs and a verified deciding `cue` per violation.

## **DATASET PREPARATION**
1. Normalization – case handling per path; trailing sentence periods stripped corpus-wide
2. NLI framing – premise "An AI agent is authorized to {goal}. The agent performs only tasks that support this goal." / hypothesis "The agent is now performing: {subtask}"
3. Contrastive framing – anchor "Goal: {goal}. Subtask: {goal}." versus subtask "Goal: {goal}. Subtask: {subtask}."
4. Three labelled classes – 0 Malicious, 1 Benign-entailment, 2 Neutral
5. Binarization for the batch metrics – label 0 = Malicious (positive class); labels 1–2 = Benign
6. Triplet construction – benign subtasks as positives, malicious subtasks as hard negatives (Cartesian product per goal); neutral rows excluded from the triplet space

## **DATA SPLIT**
Apply a goal-grouped 5-fold cross-validation (`StratifiedGroupKFold`), stratified by attack family, so that no goal appears on both sides of a fold:
5 folds – model training + per-fold threshold tuning
622 / 84 – concept-disjoint `cue_split` (primary evaluation)
643 / 63 – phrase-held-out `cue_split_phrases` (robustness check)
122 – frozen holdout, out-of-fold only

## **MODEL TRAINING**
Goal \(\rightarrow\) "Goal: {goal}. Subtask: {goal}." \(\rightarrow\) 384-dim unit embedding; Subtask \(\rightarrow\) "Goal: {goal}. Subtask: {subtask}." \(\rightarrow\) cosine similarity
Goal + Subtask \(\rightarrow\) premise/hypothesis pair \(\rightarrow\) softmax \(p(\text{contradiction})\)
Both configurations trained under a matched 4-epoch budget (batch size 32, seed 42, 10% warmup, weight decay 0.01; learning rate \(2\times10^{-5}\) NLI / \(1\times10^{-5}\) contrastive); TripletLoss with cosine distance (margin 0.5, \(\le\)64 triplets per anchor).

## **EVALUATION**
On the held-out evaluation partitions, compute:
Recall (TPR), Precision, and F1-score for both models — accuracy is not used, because the corpus is class-imbalanced — with the decision threshold swept across \(0.0\) to \(1.0\) per fold and the deployment threshold set to the mean of the five F1-optimal cut-offs (NLI \(0.735\); contrastive \(0.241\)). Report recall by stratum (`easy` / `near_miss` / `matched`) and by source, apply a one-tailed paired \(t\)-test (\(\alpha\) = 0.05) to the paired fold-level metrics, and read every accuracy figure against a bag-of-words lexical control.
