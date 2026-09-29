# Sentinel — Ethics Review Answers, Items (5) to (12)

*Answers to items (5)–(11) of [`ethics.md`](./ethics.md), with the reference list for
item (12). Items (1)–(4) are answered separately, since they carry only names,
titles and affiliations.*

## How to read this document

1. **Jargon is explained.** Technical words are used where they are the honest
   word, but each one is followed by a plain-English explanation, usually in a
   line that starts with *In plain terms*.
2. **This study does not involve human subjects, and nothing is done *to* a
   person.** No one is recruited, enrolled, dosed, tested, interviewed about
   themselves, or observed. The things being studied are (a) rows of text and (b)
   two computer models. Every item in `ethics.md` that says *"Applies to studies
   using human subjects"* is therefore answered **Not applicable**, followed by
   the reason, so the committee can see the reasoning rather than a blank.
3. **One person outside the team is involved**, and they are described wherever
   relevant: a **domain expert** (a specialist in AI-agent security) who checks
   that the dataset's labels are correct. This person is a **validator** — a
   quality checker — **not a research participant**. They are not experimented
   on, they are not measured, and nothing is recorded about them personally.
   Section (10) A explains this in full.
4. **Placeholders.** Anything in `[square brackets]` is a detail only the team can
   fill in (names, dates, retention period, contact numbers, target venue).

---

## (5) Background and Significance

### 5.1 Brief introduction

Modern "AI agents" are pieces of software that a large language model (an LLM — a
program trained on huge amounts of text that can read and write instructions) is
allowed to act on: read a record, run a database query, send a file. In the
**Sentinel** system, an operator gives an agent a **goal** ("Process disability
benefits for a veteran") and, step by step, the agent proposes **subtasks**
("Retrieve the veteran's medical records from the VA health system"). Before each
subtask runs, Sentinel asks: *is this subtask still inside the goal the operator
authorised?* Two small models score the goal/subtask pair, and the subtask is
**blocked if either model says no**.

This study improves the part of that check that has to *understand meaning*, and
proves the improvement with numbers rather than opinion.

### 5.2 The problem and the need being addressed

The current industry standard for this check is **Natural Language Inference
(NLI)**. *In plain terms:* give a computer two sentences and ask whether the second
one **follows from** the first (called *entailment*), **contradicts** it
(*contradiction*), or is **unrelated** to it (*neutral*). If the subtask
contradicts the goal, block it.

The failure this study attacks is **adversarial paraphrasing** — rewording an
instruction so that it still *sounds* like exactly the job the operator asked for,
while quietly widening what the agent will do. Examples in the studied corpus:

* "Retrieve the **veteran's** medical records" → "Retrieve **all relevant**
  medical records from the VA **and its affiliates**" (the set of records and the
  set of systems both silently grow — *scope creep*); or
* "Retrieve the records" → "Retrieve the records **and email the findings to my
  personal address**" (the permitted action now sends data somewhere it was never
  authorised to go — *data exfiltration*).

Published work on the SentinelAgent framework (Patil, 2026) reports that its
NLI-based intent verifier (**P2**, the *probabilistic* layer — "probabilistic"
means it outputs a confidence score rather than a hard rule) collapses to roughly
a **13% detection rate** under this technique. Detection rate is the **true
positive rate (recall)**: of all the malicious subtasks, how many did we catch? A
13% figure means roughly **87 in every 100** scope-expanding attacks pass through
the semantic gate. That is the security gap this study exists to close.

Three established findings in computational linguistics explain *why* NLI fails,
and each one points at the same architectural fix:

| Why NLI fails | In plain terms | Source |
| --- | --- | --- |
| **Shortcut learning / lexical overlap heuristic** | The model guesses "same words ⇒ same meaning", so an attacker who keeps the original vocabulary but changes the operational meaning is rewarded, not punished. | McCoy et al. (2019); Du et al. (2023) |
| **Surface form sensitivity and output mode collapse** | Rephrase the input and a generative model stops obeying its output format — it answers with chatty prose instead of a clean Yes/No authorisation decision, which breaks an automated pipeline. | Liu & Meng (2026) |
| **Absence of compositional semantics ("compositional blindness")** | The model compares the *overall* feel of two sentences instead of checking the logical job of each word, so a single-word qualifier ("this file" → "**all** files") can move the authorisation boundary without triggering an alarm. | Chanchani & Huang (2023); Jurafsky & Martin (2026) |

### 5.3 Historical basis for the R&D

This work sits on three existing bodies of work rather than inventing a problem:

1. **DelegationBench v4** (Patil, 2026) — a published benchmark (a standard exam)
   of agent-delegation scenarios with a documented NLI baseline, including
   adversarial paraphrases. It is the only public benchmark with these attack
   types, which is why it is used for the head-to-head comparison. It is used
   **with the original author's explicit permission**, obtained through direct
   correspondence.
2. **The SentinelAgent layered architecture** (Patil, 2026) — its other layers
   (P1 authority narrowing, P3 policy conjunction, P4 forensic chain, P5
   containment, P6 scope-action conformance, P7 output schema) are deterministic
   ("deterministic" = rule-based, always the same answer) and already reported at
   100% true positive rate on rule-based violations. They are treated as proven
   and are *not* re-built here; this study isolates P2.
3. **Contrastive representation learning with sentence transformers** (the
   MiniLM family, TripletLoss training) — the machine-learning toolkit the
   proposed solution is built from.

### 5.4 Utilization of the expected output

* **A validated dataset.** A purpose-built corpus of delegation scenarios
  (9,900 rows; 9 service domains; 11 violation types), checked by an independent
  domain expert, released with its generation method so others can reuse it.
* **A drop-in replacement model.** A fine-tuned MiniLM contrastive embedding
  model (see (7) A) that occupies the same P2 slot as the NLI verifier, together
  with its calibrated decision threshold and its measured metrics.
* **A reproducible pipeline and reference implementation.** The training and
  evaluation scripts, plus the working gateway in this repository (Next.js
  console → Express API gateway → FastAPI inference service), so that a third
  party can re-run the experiment and deploy the guardrail. The models run on CPU
  — no GPU rental needed.
* **A documented comparison.** Recall, Precision and F1-Score for both
  architectures on identical data, with a statistical significance decision.

### 5.5 Socioeconomic benefits

* **Protects personal data at scale.** The failure mode being fixed is
  over-collection and unauthorised sharing of records. Every blocked scope
  expansion is a breach that does not happen, and breach response is expensive
  (notification, remediation, legal exposure) while prevention is cheap.
* **Makes guardrails affordable for small organisations.** Because the model is
  small (MiniLM; ~384-number "embeddings", described in (7) A) and runs on a
  laptop CPU, public agencies and small businesses can verify agent behaviour
  without cloud inference bills or specialised hardware.
* **Enables trustworthy automation in public services.** Government and health
  workflows are exactly where the corpus scenarios live (benefits, tax, medical
  records, insurance). Verifiable authorisation is a precondition for agencies to
  adopt agentic automation at all; without it, the safest policy is to refuse the
  technology, or to accept unchecked risk.
* **Builds local research capacity.** The study needs only commodity hardware and
  open-source tools, and it leaves behind an open dataset and an open
  implementation that Filipino students and developers can build on.
* **Reduces public risk from AI errors.** When an agent goes wrong, the harm
  lands on ordinary people — claimants, patients, workers — not on the
  organisation that deployed it. A verifier that catches boundary violations
  shifts that risk back to where it can be controlled.

### 5.6 Possible impact on health and allied health science

The study involves no clinical care, no patient, and no medical device; it is not
used to diagnose or treat anyone. Its impact on health and allied health is
**indirect but specific**: the delegation scenarios include health and
benefits-record workflows (a veteran's medical records, a patient's insurance
history), and health information is among the most sensitive categories of
personal data. The class of failure studied — an agent quietly widening an
authorised query, or routing authorised data to an unauthorised destination — is
precisely what health-data protection rules exist to prevent. A verifier that
reliably blocks those expansions reduces the practical risk that automated agents
acting on health-adjacent systems over-collect, over-retain, or over-share
recorded health information, and it supports continued clinician and patient
trust in health-IT automation.

### 5.7 Users and beneficiaries

* **Direct users:** engineers, security reviewers and audit teams deploying
  agents; researchers evaluating intent-verification methods.
* **Direct beneficiaries:** the people whose data those agents touch — patients,
  veterans, benefit claimants, customers, employees.
* **Indirect beneficiaries:** the SentinelAgent research line, the open-source
  agent-security community, and regulators looking for a measurable safety
  control rather than a promise.

### 5.8 Impact on the country

Public-sector and enterprise adoption of AI agents is rising faster than the
tools to verify what those agents actually do. This study contributes a
*measurable* control (with published recall, precision, F1 and a significance
test) and an openly available dataset and implementation, so that adoption
decisions in the country can rest on evidence that others can reproduce — and so
that local teams are not dependent on foreign, closed security tooling.

---

## (6) Objectives and Research Questions

### General objective

To determine whether a **contrastively fine-tuned MiniLM embedding model**
outperforms the **standard NLI baseline** in verifying that an agent's subtask
still aligns with its authorised goal, under both normal conditions and
adversarial paraphrasing.

*In plain terms:* instead of asking a model to *classify* two sentences as
implies/contradicts, we train a model to place sentences as **points in space**
and to judge them by **distance** — authorised subtasks land close to the goal,
unauthorised ones are pushed far away. The objective is to establish, with
statistical evidence, whether distance-based checking catches more attacks than
classifier-based checking.

### Specific objectives

1. **SO1 — Measure the baseline.** To measure the detection performance of the
   baseline NLI-based intent verification (SentinelAgent P2) under adversarial
   paraphrasing and normal conditions, in terms of True Positive Rate (Recall),
   Precision, and F1-Score.
2. **SO2 — Build and measure the proposed model.** To fine-tune a MiniLM
   sentence-transformer using a contrastive learning objective on
   delegation-specific (anchor, positive, hard-negative) triples, and to measure
   the same three metrics under the same conditions.
3. **SO3 — Compare with statistics.** To determine whether the difference between
   the two architectures is statistically significant, using a one-tailed
   paired-sample t-test at α = 0.05 for each metric independently.
4. **SO4 — Build and validate the dataset.** To construct a delegation-scenario
   corpus covering the documented violation classes, and to verify its labels
   through an independent expert review with a reported agreement rate, margin of
   error, and confidence level.

### Research questions

1. **RQ1.** What is the detection performance of the baseline NLI-based intent
   verification (SentinelAgent P2) under adversarial paraphrasing and normal
   conditions, in terms of (a) True Positive Rate (Recall); (b) Precision; and
   (c) F1-Score?
2. **RQ2.** What is the detection performance of the proposed contrastive
   embedding model under the same conditions, in terms of (a) True Positive Rate
   (Recall); (b) Precision; and (c) F1-Score?
3. **RQ3.** Is there a significant difference between the baseline NLI-based
   model and the proposed contrastive embedding model under those same
   conditions, in terms of (a) True Positive Rate (Recall); (b) Precision; and
   (c) F1-Score?

*Vocabulary note.* **True Positive Rate (Recall)** = of all the malicious subtasks,
what share did we catch? **Precision** = of the subtasks we flagged, what share
were genuinely malicious (i.e. how many legitimate actions did we wrongly block)?
**F1-Score** = the balanced average of the two, used when both kinds of mistake
matter. Accuracy is deliberately *not* used: the dataset is class-imbalanced
(roughly 140 benign to 60 malicious), so a model that always answers "benign"
would score high accuracy while catching nothing.

### Hypotheses (tested for RQ3)

* **H₀ (null):** The proposed contrastive embedding model does **not** improve the
  true positive rate compared to SentinelAgent's NLI-based model under
  adversarial paraphrasing and normal conditions.
* **H₁ (alternative):** The proposed contrastive embedding model **does** improve
  the true positive rate compared to that baseline.

The same directional test is run separately for Precision and F1-Score. α = 0.05
(α is the agreed risk of calling a difference real when it is only luck; 0.05 means
a 5% chance of that error). If p ≤ 0.05 we reject H₀; if p > 0.05 we fail to
reject it and treat the difference as unproven.

### Scope note (what is deliberately *not* claimed)

The study evaluates **only** the probabilistic semantic layer (P2) and only the
attack class that defeats it — scope-expanding adversarial paraphrases that keep
surface similarity. It does not evaluate the deterministic layers, other attack
vectors (data poisoning, model extraction, multi-turn adaptive attacks), live
deployment behaviour (latency, token expiry), or languages other than English.

---

## (7) Materials and Methods

### A. Study Design

**Type.** Experimental and developmental, quantitative.

* *Experimental*, because two verification architectures are compared under
  controlled conditions on identical data.
* *Developmental*, because the proposed architecture is built (fine-tuned) as
  part of the study.
* *In plain terms:* we build two versions of the same "checker" and grade both on
  the same fixed exam, then test whether the grade difference is real.

**Definitions as they apply here.**

| Term | How it applies to this study |
| --- | --- |
| Unit of analysis | One delegation row (a goal + a benign subtask + an adversarial subtask) and, at the next level, one evaluation fold. |
| Control / baseline | The NLI cross-encoder (SentinelAgent P2) — the current standard. |
| Experimental / treatment | The contrastive MiniLM embedding model — the proposed solution. |
| Outcome / endpoint | Recall (primary), Precision and F1 (secondary). |

**Prospective or retrospective?** Both, in a documented way. The purpose-built
corpus is **prospective** — generated for this study, then verified. The
**DelegationBench v4** material used for the external head-to-head comparison is
**retrospective** — a published benchmark that already exists (used with the
original author's permission).

**Number of centers; randomised?** Not applicable. This is not a clinical trial:
there is one research team, one workstation, and no site, clinic, or multi-centre
coordination. No person is randomised to any group. The only randomisation is
statistical: the corpus's evaluation split is **stratified** (keeps the same
benign/malicious mix in every part) and **grouped by goal** (the same goal never
appears in both the training part and the test part, which would be like giving a
student the exam answers beforehand). A fixed random seed makes the split
reproducible.

**Blinded? Placebo?** There is no drug and no placebo — nothing is given to
anyone. Medical-style blinding is therefore not applicable. Two safeguards stand
in its place:

* **The expert review is blind.** The reviewer is shown the row and the policy it
  claims to violate, but *not* the automatic quality warnings and *not* any model
  prediction, so their judgement cannot be anchored by a machine's opinion.
* **Scoring is mechanical.** Both models are scored by the same script on the same
  held-out folds, so no person's expectation can influence a number.

**Period of enrolment / chart review.** There is no enrolment, and no charts. The
study period is `[Month Year]` to `[Month Year]`, covering corpus generation →
expert review → training → evaluation → analysis → writing. No real medical,
financial or government records are read by anyone at any point.

**Informed consent?** **Not applicable** — no human subjects. See (10) A.

**Study drug, device or intervention.** None. No substance, no device, and no
procedure touches any living being. The "intervention" in this study is a change
of software architecture, tested entirely offline on static text.

**Randomisation / sampling.** Four distinct sampling steps, each with a stated
rule:

| Step | Rule |
| --- | --- |
| Corpus construction | Every (domain × anchor × policy × sample) **cell** yields exactly one positive and one negative, so no goal is over- or under-represented: 9 domains × 50 anchors × 11 policies × 2 samples = **9,900 triplets**. |
| Evaluation split | **5-fold stratified, grouped-by-goal** cross-validation, fixed seed. *In plain terms:* the data is cut into five parts; each part is used as the test set exactly once, so every row is tested, every fold keeps the same benign/malicious balance, and no goal leaks across the boundary. |
| Expert review sample | Stratified random sample of **≈370 rows** (95% confidence, ±5% margin of error), with at least 25 rows per policy and all 9 domains represented. |
| Reporting strata | Metrics are also broken down per malicious subset (explicit attacks vs. adversarial paraphrases) and per policy, because *which* violation class is missed matters more than one aggregate figure. |

**Instruments.** Two, both researcher-built:

1. **The experiment paper** — the structured record of the batch-level evaluation
   (per batch: identifier, architecture, condition, Recall, Precision, F1). This
   is the quantitative instrument from which the research questions are answered.
2. **The expert review sheet** — a plain CSV (spreadsheet) generated by
   `training/review_sheet.py`, blind, shuffled and stratified. Columns:
   `row_index`, `data_number`, `domain`, `policy_violation`, `policy_name`,
   `anchor`, `positive`, `negative`, then the reviewer's fields
   `positive_is_authorised` (is the benign side genuinely inside the goal's
   authorisation boundary?) and `negative_commits_policy` (does the malicious side
   really commit the named policy?), answered **y / n / ?**, plus one-line
   `notes`. Each column is answered per row, with `?` available when a human truly
   cannot decide — those rows are reported as a finding in their own right.
3. **The policy matrix** (`data-gen/prompt.py`, Tables 4.1–4.3 of the plan) is
   supporting material rather than an instrument: it defines, in words, what
   "committing" each of the 11 violations means, and is given to the reviewer so
   that both the generator and the reviewer work from the same definitions.

**Endpoints: the main thing being looked at.**

| Endpoint | Definition | Role |
| --- | --- | --- |
| **Recall / True Positive Rate on adversarial paraphrases** | Share of scope-expanding attacks correctly blocked | **Primary** |
| Precision | Share of flagged subtasks that were genuinely unauthorised (guards against "block everything") | Secondary |
| F1-Score | Balanced average of the two | Secondary |
| Per-policy TPR | Recall broken down by violation class | Diagnostic |
| Expert label agreement rate | Share of review verdicts that match the corpus label, with 95% confidence interval | Validity endpoint |

### B. Study Population

**Who.** There is no human population. The study's population is a set of
**delegation scenarios** (text records):

* the intent-verification subset of **DelegationBench v4** — 200 verifiable
  scenarios (60 malicious, 140 benign) across 12 U.S. federal government service
  domains, used with the original author's permission; and
* the **purpose-built corpus** generated for this study — 9,900 triplets across
  9 domains (Federal, Healthcare, Retail, Finance, Customer Service, Education,
  Insurance, Legal, HR), 450 goals, and 11 violation policies, in English.

Age, sex, race and diagnoses are **not applicable**: no person is characterised,
measured or described.

**Inclusion criteria (per record).** A record is included only if:

* it is a complete triplet — root goal (*anchor*), a benign authorised subtask
  (*positive*), and a policy-violating subtask (*negative*);
* its violation corresponds to a defined policy in the policy matrix;
* it passes the deterministic checks applied at generation: non-empty, ASCII-only
  (this also catches the generator drifting into another language), single line,
  at least three words, not a verbatim copy of the goal or of the positive,
  within the length window derived from the positive's own length, no duplicate
  within the same goal, containing the element the policy requires, and free of
  vocabulary that belongs to a *different* policy class; and
* it carries a resolvable domain, policy and provenance record.

**Exclusion criteria.** Empty, malformed or multi-line text; non-English output;
duplicates within a goal; rows whose violation class cannot be identified; rows a
reviewer judges not to commit the named policy (they are relabelled or dropped
with a written reason); and the *Replay Exploitation* policy family, removed in
the active dataset version (`dataset_v2.csv`) because its scenarios were ambiguous
and overlapped neighbouring policies.

**Experimental group vs. control group.** Two groups, defined by architecture, not
by people:

| | Model | Data it sees | Role |
| --- | --- | --- | --- |
| **Control** | NLI cross-encoder `cross-encoder/nli-MiniLM2-L6-H768` (fine-tuned 3-class) | The triplets converted into premise/hypothesis pairs | Baseline benchmark |
| **Experimental** | `all-MiniLM-L12-v2` fine-tuned with TripletLoss (cosine) | The triplets directly, in the framed template `"Goal: {goal}. Subtask: {subtask}."` | Proposed solution |

Both are given the **same rows and the same folds**, so any measured difference is
attributable to the architecture rather than to the data.

### C. Assessment of Resources

**Access to the study population.** Guaranteed by construction. The corpus is
produced by the researchers using a locally hosted LLM endpoint
(`qwen2.5-14b-instruct`), and the benchmark material is either public or used with
documented permission. There is no dependency on recruiting, no gatekeeper, no
institution's records, and no real personal data — so the usual reason a study
stalls (no access) does not apply.

**Sufficient time.** Work is scripted, resumable and version-controlled, so it can
be paused and resumed without losing progress. Indicative allocation:
corpus generation `[N]` days, expert review 1–3 weeks (reviewer-paced), model
training hours (not days, thanks to the GPU described below), analysis and writing
`[N]` weeks. The training runs are already staged into quick smoke tests before
the full runs, so progress is verifiable at every step.

**Adequate qualified staff.** The proponents wrote the pipeline and have run it
end to end; the research assistant(s) are briefed on the protocol and on their
specific duties (running generation passes, auditing flagged rows, preparing and
scoring the review sheet, recording results). The expert reviewer's qualifications
are documented (CV/portfolio) and recorded in the study file.

**Adequate facility.** One research workstation — the team's own computer with an
AMD Radeon RX 9060 XT GPU (ROCm compute stack) and a CPU fallback path — plus the
open-source software stack (Python 3.12, PyTorch, sentence-transformers, FastAPI,
Node/Express, Next.js). No laboratory, hospital, clinic, specialised equipment,
travel or cloud subscription is required. Everything runs offline.

**Staff training on the protocol and duties.** Each script is documented and
committed to the repository; both proponents and RAs run the smoke tests before
any final run; the review procedure ships with written instructions, the policy
definitions, and worked examples, so the reviewer receives exactly the same
briefing every time.

### D. Study Procedures

**Plans for recruitment.** There is no recruitment of research participants. The
single expert reviewer is **invited directly** by the project leader, on the basis
of documented subject-matter expertise in agent security, NLP, or the relevant
service domain — no advertising, no open call, no incentive, and no obligation to
accept.

**Number and estimated length of each study visit.** There are no visits. The
reviewer works asynchronously on a file. The ≈370-row sheet is split into batches
(about 100 rows each) with an estimated 30–60 seconds per row, i.e. roughly
**30–60 minutes per batch and about 4–8 hours in total**, taken over as many
sittings as the reviewer chooses. There is no deadline imposed by the study, and
the reviewer may stop or withdraw at any point without giving a reason.

**Procedures performed, phase by phase.**

| Phase | Procedure | Who performs it | Output |
| --- | --- | --- | --- |
| 1. Corpus generation | For each cell, the LLM writes one benign subtask and one adversarial subtask against the policy matrix and the assigned paraphrasing strategy; each result is checked against the deterministic rules; rejected attempts are retried with the reason fed back | Researchers + script | `triplets.jsonl` (append-only ledger), `triplets.json` |
| 2. Internal audit | Scripted audits flag duplicate/conflicting labels, compound rows that do not actually combine two violations, benign rows containing violation patterns, and malicious rows showing none of their policy's markers | Researchers | Flagged-rows report (triage only; see the caveat in (9)) |
| 3. Expert review | Blind, shuffled, stratified sample of ≈370 rows; the expert answers the two judgement fields per row, with `?` allowed and notes required for any `n`/`?` | Independent domain expert | Completed review sheet |
| 4. Review scoring | Agreement rate computed against the corpus labels, with Wilson 95% confidence interval, margin of error, and per-policy disagreement | Researchers + script | Review report (a study finding) |
| 5. Baseline run | Fine-tune/evaluate the NLI model over the 5 folds; record per-fold and per-subset metrics | Researchers + script | Per-fold metrics for the control |
| 6. Proposed run | Fine-tune/evaluate the contrastive model on the identical folds | Researchers + script | Per-fold metrics for the treatment |
| 7. Comparison | One-tailed paired-sample t-test per metric on the paired fold values | Researchers + script | t-statistic, p-value, hypothesis decision |
| 8. Reporting | Assemble the manuscript, the experiment paper, the model configuration (thresholds + metrics), and the reproducible artifact set | Team | Thesis, defense, publication |

**If a drug study — administration, handling, storage, disposal.** Not applicable:
no drug, no substance, no consumable of any kind.

**Biological samples.** None. No specimen, swab, blood, saliva or tissue is
collected, stored, tested or disposed of. Nothing biological is involved anywhere
in the study.

**Behavioural studies — instrument and administrator.** Not applicable in the
human-subject sense. The closest element is the review sheet, which is
*administered by the researchers* (delivered as a CSV with written instructions and
the policy definitions) and is *not* a psychological or behavioural test: it asks a
factual judgement about a dataset row ("does this text commit this defined
violation?"), not about the reviewer's behaviour, beliefs, health or personality.

**Survey study — authorship, standardisation, distribution, confidentiality.**
The review sheet is not a survey of opinions and is not a standardised
psychometric instrument; it is a **structured expert adjudication form** built by
the researchers for this corpus. It is distributed by a direct, access-controlled
channel (email attachment or the institution's own file service), returned the
same way, and contains **only dataset rows** (keyed by `data_number`) — no personal
data about the reviewer, no results of the study, and no model predictions. Its
confidentiality therefore rests on not containing anything confidential.

**Chart review.** Not applicable — no medical charts, no patient records, no
institutional datasets. To be explicit about the component that is retrospective:
the study re-uses an **already published benchmark** (DelegationBench v4), obtained
and retained under the original author's permission and cited in the manuscript.
No information of any kind is used to identify a potential human subject, because
no human subject is sought and none exists in the material. The corpus is
synthetic: the generation prompt **forbids** inventing identifiers or placeholder
personal data (no "John Doe", no "123456", no "123 Elm St"), and the validation
step rejects rows that look like that.

### E. Data Collection

**How and what data are collected.**

*Per delegation row:* the anchor (goal), the positive (benign subtask), the
negative (adversarial subtask), the domain and its machine key, the anchor index
within its domain, the violation policy id and name, the paraphrasing strategy,
the generating model name, a UTC timestamp, a schema version, and the record's
`data_number`. Also the review status field, which moves from "unreviewed" to the
expert's verdict.
*Per model run:* per-fold and per-subset Recall, Precision, F1, false-positive
rate, accuracy, the selected threshold, confusion matrices, and per-policy recall.
*From the expert review:* the two verdict fields and the one-line notes.

No demographics, comorbidities, health measurements, or any other person-related
variable is collected — because there is no person in the data.

**Reliability and validity of the research instrument.**

* *The experiment paper* is validated by being computed, not judged: every value
  is derived mechanically from the confusion matrix (the table of correct/incorrect
  decisions, explained in (7) F) by a committed script, so the instrument cannot
  drift and a third party can reproduce every figure.
* *The review sheet* takes its **content validity** from the policy matrix, whose
  violation classes are aligned with DelegationBench v4's published attack
  categories; the two judgement fields map one-to-one onto the dataset's own
  labels, so agreement is directly interpretable.
* Its **reliability is measured and reported**, not assumed: agreement rate, Wilson
  95% confidence interval, margin of error, and per-policy disagreement. Rows the
  expert marks `?` are retained and reported, because a row no human can decide
  floors what any model can fairly be scored on.
* The sheet is **blind** (no automatic flags, no model predictions) precisely to
  avoid anchoring the reviewer — the flagging heuristics were measured to be badly
  over-inclusive, so showing them would bias the review.
* If the committee prefers an **inter-rater** estimate, a second independent expert
  reviews a subsample (e.g. 100 rows) and inter-rater agreement is reported
  alongside the corpus agreement; disagreements are adjudicated in writing by the
  two reviewers with the researchers recording the resolution.

### F. Data Analysis

**Sample size considerations.**

* *For model evaluation*, the corpus size (9,900 triplets / 9,900 benign / 9,900
  adversarial examples) is a **design decision, not a power calculation**. It was
  chosen from three precedents plus a feasibility bound: (i) published evidence
  that a 2026 clinical-text study reached 95% of its achievable performance with
  600 examples for 10 of 11 modelled diagnoses, i.e. gains flatten well before the
  10,000-example mark; (ii) the Adversarial NLI (ANLI) benchmark, whose test sets
  are roughly 1,000 examples; (iii) paraphrase benchmarks such as PAWS-X (23,459
  pairs) and PAWS (49,175 training pairs); and (iv) that each triplet is
  effectively three human-readable annotations, so 9,900 triplets ≈ 29,700
  sentence-level annotations — the amount an independent expert can plausibly
  verify.
* *For expert verification*, the sample is sized with **Cochran's formula with a
  finite-population correction**:

  ```
  n₀ = Z² · p(1−p) / e² = 1.96² × 0.25 / 0.05² = 384.16
  n  = n₀ / (1 + (n₀ − 1)/N) = 384.16 / (1 + 383.16/9,900) ≈ 370
  ```

  where Z = 1.96 (95% confidence), p = 0.5 (the worst case, which maximises the
  required sample), e = ±5% margin of error, and N = 9,900. The realised sheet
  contains 370 rows covering all nine domains. The resulting margin of error at an
  observed agreement of 90% is `MoE = 1.96 × √(0.90 × 0.10 / 370) ≈ 3.1%` — i.e.
  95% confidence that corpus-wide agreement is within about ±3% of the observed
  rate.
* *For the fold-level comparison*, the paired design uses every fold as one pairing;
  the number of pairs (5) is a known power limitation and is listed in (9).

**Statistical methodology.**

*Descriptive (RQ1 and RQ2).* Mean and standard deviation of Recall, Precision and
F1 across folds overall and per malicious subset (all malicious, adversarial
paraphrases, explicit attacks), plus the pooled confusion matrix and per-policy
recall. Standard deviation is reported because it shows how *stable* a model is
across different paraphrase mixes, not just how good it is on average.

*Inferential (RQ3).* A **one-tailed paired-sample t-test** per metric, at α = 0.05.
*In plain terms:* each fold produces one score for the baseline and one for the
proposed model; we look at the five differences, and ask whether they are
consistently positive or explicable by chance. The test is **paired** because both
models face exactly the same fold — this removes variation caused by the data
itself and leaves only the difference caused by the architecture. It is
**one-tailed** because the hypothesis is directional (we predict improvement, not
just difference).

*Decision rule.* p ≤ 0.05 → reject H₀ (a statistically meaningful improvement for
that metric); p > 0.05 → fail to reject H₀ (insufficient evidence; the difference
may be random variation). Reported for each metric: t-statistic, p-value, and the
decision.

*Equations used.*

```
Precision = TP / (TP + FP)
Recall (TPR) = TP / (TP + FN)
F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

where, in this study: **TP** = adversarial/scope-expanding subtasks correctly
identified as unauthorised; **TN** = benign subtasks correctly authorised;
**FP** = benign subtasks wrongly blocked; **FN** = adversarial subtasks wrongly
permitted.

*Validity statistics for the dataset.* Agreement proportion with a **Wilson score
interval** (a confidence interval that behaves correctly for proportions, unlike
the simple normal approximation at small samples), the margin of error above, and
per-policy disagreement rates. Acceptance criteria for the corpus: expert agreement
**> 85%**, margin of error within ±5%, and coverage of all nine domains; if
agreement falls below target, disagreements are examined, labels corrected, and
the affected rows re-sampled while the review continues.

---

## (8) Safety and Monitoring Plan

**In plain terms:** there is no patient and no treatment, so there is nothing to
monitor for clinical safety. What *is* monitored is (a) that no person comes to any
harm through the study, and (b) that the data and the reported numbers are
trustworthy. Part (b) is where most of the work sits.

**Safety monitoring (participant safety).** No human participant is exposed to any
procedure, substance or intervention, so no clinical safety monitoring, no
Data Safety Monitoring Board, and no stopping rules for participant harm are
required. No adverse event is anticipated. The one person with any involvement —
the expert reviewer — may stop at any time; the work is delivered in short batches;
and the material they read is synthetic, dry and non-graphic.

**Data-integrity monitoring (the substantive monitoring plan).**

| Stage | What is monitored | Mechanism |
| --- | --- | --- |
| Generation | Every generated row | Deterministic validation runs *before* anything is written: emptiness, language drift (non-ASCII), multi-line output, length window, verbatim duplication, bolted-on clauses, presence of the element the policy requires, absence of vocabulary belonging to another policy class, duplicates within the goal |
| Generation | Failed attempts | Each of up to 50 attempts records a reason and feeds a correction note into the next attempt; after all attempts fail, the row is **dropped rather than written with a wrong label**, and the failure is reported loudly |
| Generation | Crash / restart integrity | An append-only ledger (one JSON Lines record per completed cell) with `--resume`, so an interruption costs at most one row and cannot silently duplicate or lose work |
| Post-generation | Suspicious rows | Scripted audits flag duplicate/conflicting labels, compound violations missing a violation dimension, benign rows containing violation patterns, and malicious rows showing none of their policy's markers — used as *triage for human attention*, never as a defect rate (see (9)) |
| Verification | Label correctness | The blind, stratified expert review (~370 rows) and its scoring script: agreement rate, Wilson 95% CI, margin of error, per-policy disagreement |
| Training/evaluation | Reproducibility | All scripts, configurations, seeds and results are committed to a private Git repository; the fold split uses a fixed seed; model weights are excluded from version control but regenerate from the scripts |
| Training/evaluation | Optimism in the reported numbers | The decision threshold is the **mean of the per-fold F1-optimal cut-offs** (an honest, held-out procedure, not a threshold chosen on the test fold), and the epoch budget is fixed in advance (4 epochs) so nothing is selected by looking at test results |
| Reporting | Fabrication / drift | Every figure in the manuscript is produced by a committed script; results are reported as measured, including any disagreement or non-significant finding |

**Where the collected data will be stored.** On the researchers' own local machines
inside the project directory, and in a **private, access-controlled Git
repository** (with binary model weights excluded). No cloud storage, no third-party
hosting, no public link during the study. Credentials and environment files (API
keys, `.env`) are excluded from version control. The review sheet is transferred to
and from the reviewer through a direct, access-controlled channel rather than a
public link.

**Who will have access to the collected data.** The project leader, the
co-proponents and research assistants, and the research adviser; the defense panel
for the documents under its review. The external expert reviewer sees **only** the
review sheet (dataset rows plus the policy definitions) — no study results, no model
predictions and no personal data. No other party receives access without the
adviser's and the committee's approval.

**How long the data will be stored.** For the duration of the study and for
`[one (1) year]` after the final defense, or for whatever period institutional
policy requires, whichever is longer. Regenerable artifacts (model weights) may be
deleted earlier, since the scripts recreate them.

**How the researchers will destroy the collected data.** At the end of the
retention period: digital copies are deleted from every storage location that held
them, including backups, and any paper copies (e.g. a printed sheet if the reviewer
requested one) are shredded. Because the material contains no personal data about
anyone, disposal carries no privacy risk; what remains permanently is only the
aggregate results and, if approved, the synthetic corpus in its de-identified form
as a published research dataset.

**Containment of the adversarial material.** The corpus contains instructions that
*would* be harmful if executed — exfiltrating records, retaining access
indefinitely, escalating privileges. They are inert here: they are text only, stored
as a label in a dataset, and **no agent, tool, API or live system is ever wired to
them**. The entire experiment runs offline against static text; no live AI agent is
deployed, no real-time inference pipeline is probed, and no Delegation Authority
Service is subjected to adversarial traffic. No third party's infrastructure is
touched, and no researcher executes a generated instruction against any system.

**Reporting of problems.** Any incident — unexpected distress to the reviewer, loss
or corruption of data, a discovered label error large enough to change a reported
conclusion, or any unforeseen event — is reported by the project leader to the
research adviser and to the ethics committee within 24–48 hours, with a written
note of what happened, what was changed, and whether any result must be recomputed.
Label errors affecting a conclusion trigger a re-run and an erratum note rather than
a silent correction.

---

## (9) Limitations

This section lists the characteristics of the design and method that could
influence how the findings should be read.

1. **No human subjects, so no human-facing findings.** Because nobody is enrolled,
   the study says nothing about how operators would use, trust, override or
   sabotage such a guardrail, nor about its usability or its effect on people's
   willingness to deploy agents. Those are separate studies.
2. **The adversarial material is machine-generated.** The corpus was written by an
   LLM (`qwen2.5-14b-instruct`) under the researchers' policy matrix. The
   generator's vocabulary, habits and blind spots become the corpus's, so the
   measured metrics describe performance on *this* corpus, not on every paraphrase
   an adversary could invent. A different or stronger generator would likely
   produce a harder exam.
3. **Only a sample of the corpus is expert-verified.** Roughly 370 of 9,900 rows
   (≈3.7%) were reviewed. The review therefore *estimates* the label-error rate
   with a margin of error; it does not certify every row. Rows outside the sample
   retain their automatic labels.
4. **Automatic quality flags are heuristics, not verdicts.** The lexical triage
   rules cannot see meaning: applied as a gate they failed 28.8% of the corpus,
   including 91.3% of the scope-creep rows a human reviewer accepted as legitimate.
   Flags therefore route human attention; they are not defect rates, and they
   should never be quoted as such in the thesis. Some genuinely problematic rows
   (for example, a subtle subject swap) carry no lexical marker at all.
5. **Some rows are genuinely ambiguous.** Even a human marks some rows `?`. A row
   no reviewer can decide is a row no model can be scored fairly on, which puts a
   floor under the achievable error and a ceiling on the observable improvement.
6. **Threshold sensitivity and model capacity.** The decision boundary is set from
   the mean of per-fold F1-optimal cut-offs; a different selection rule would shift
   the precision/recall balance. Only one architecture and one base model
   (MiniLM-L12-v2, 384-dimensional embeddings — a deliberately small model chosen
   for CPU speed) are tested, so the results speak to that configuration, not to
   contrastive embeddings in general.
7. **Limited statistical power and multiple comparisons.** The paired t-test runs
   on only five fold-level pairs and is repeated for three metrics without a
   correction for multiple testing. Confidence intervals will therefore be wide,
   the chance of a false positive somewhere among the three tests is above 5%, and a
   non-significant result would mean "not proven", not "equivalent".
8. **Narrow scope of generalisation.** English only; text instructions only; 9–12
   service domains weighted towards public services and enterprise workflows. No
   evidence yet for other languages, other domains, or other input types such as
   images or code.
9. **Only one attack family is evaluated.** The study targets scope-expanding
   adversarial paraphrases, because that is the family that defeats the NLI
   baseline. Data poisoning, white-box model extraction, multi-turn adaptive
   attacks, prompt injection arriving through third-party content, and social
   engineering are out of scope. A model that resists these tests is not thereby
   shown to resist those.
10. **Offline-only evaluation.** No latency or throughput measurement, no token
    expiry, no network effects, and no adversary who can see and adapt to the
    model. The results are a controlled proof of concept, not an operational
    security guarantee.
11. **A single baseline configuration.** The comparison is against one NLI
    configuration trained under the matched protocol (identical data, folds, seed,
    optimizer and selection rule, fixed 4-epoch budget), not against every NLI
    approach in the literature.
12. **Dataset provenance must be pinned in the write-up.** The project retains more
    than one dataset version (the published benchmark subset, and the purpose-built
    corpus whose `dataset_v2` removes the *Replay Exploitation* family), and its
    documentation uses different counts in places. The exact version used for the
    final reported numbers must be identified in the manuscript, or the results are
    not reproducible.
13. **Labels and predictions are not independent.** Model performance is measured
    against labels that are themselves the object of verification, so any error
    shared between the label rule and the model would inflate the score. The expert
    sample bounds this risk but does not eliminate it.
14. **Passing the test is not deployment safety.** The verifier is one layer (P2) of
    a layered design, evaluated with the deterministic layers assumed to behave as
    reported in prior work. Offline success does not guarantee safety in a live
    multi-agent deployment.

---

## (10) Ethical Considerations

**Opening statement.** This study is a technical evaluation of software models on
synthetic text. It involves **no human subjects**: no participants are recruited,
enrolled, exposed to any intervention, or asked about their health, behaviour or
personal life; no personal data, private communications, or individually
identifiable information are collected, processed or exposed; no real medical,
financial or government records are read by anyone. Accordingly, the parts of this
item marked *"applies to studies using human subjects"* are answered **Not
applicable**, with the reasoning stated so the committee can verify it rather than
trust it.

The one person outside the research team who is involved — the domain expert who
verifies the dataset labels — is a **validator, not a research participant**. They
are not experimented upon, not measured or profiled, and nothing about them is
recorded; only their verdicts on dataset rows are kept. *In plain terms:* this is
closer to asking a senior colleague to check your exam answer key than to running a
study on the colleague.

The researchers also commit to academic integrity: all borrowed material, code and
datasets are cited and used under their stated terms (DelegationBench v4 with the
original author's permission, obtained through direct correspondence), results are
reported as measured rather than as wished for, and the entire evaluation is
reproducible from the committed scripts.

### A. Informed Consent *(applies to studies using human subjects)*

**Not applicable — this study uses no human subjects**, and therefore **no waiver
or alteration of informed consent is requested**: the consent requirement does not
arise. *In plain terms:* an informed consent form exists to protect a person who is
being experimented on. Nobody here is experimented on; the objects of study are
dataset rows and machine-learning models.

Because one person does perform a task for the study, the applicable provisions are
still described, in case the committee treats that person as a participant:

a) **Circumstances under which consent/agreement would be obtained.** The expert is
   approached by the project leader (by email or in person) and given, before any
   work: what the review is, why it is needed, what will be asked of them, how long
   it is expected to take, how their answers will be used and reported, and that
   refusal or withdrawal is entirely free of consequence. Agreement is confirmed in
   writing before a sheet is sent. Their participation generates no personal data —
   only verdicts on dataset rows.
b) **How consent is documented.** A one-page reviewer information-and-agreement
   sheet (Appendices) restating the above, plus the option to mark `?`, to stop at
   any point, and to choose how they are credited. Signed (or emailed) confirmation
   is kept with the study records. No consent form is required from anyone else
   because there is no one else.
c) **Special provisions for vulnerable populations.** None are required: no
   vulnerable population is enrolled as a subject. The reviewer is a consenting
   adult professional acting in a voluntary capacity. Should that person be treated
   as a participant, the additional protections in (B) and (F) apply to them.
d) **Steps taken to minimise coercion.** Nobody has authority over the reviewer in
   this study: participation is unpaid, no payment is contingent on completion,
   there is no deadline imposed by the study, and the reviewer may decline, pause or
   withdraw without giving a reason or suffering any consequence. The researchers
   state in writing that declining will not affect any working relationship,
   evaluation, recommendation or authorship decision. Where the reviewer is a
   colleague or faculty member, they are approached as a peer, and the invitation is
   framed so that refusing is as easy and as socially safe as accepting.
e) **Who will be involved in obtaining it.** The project leader, with the research
   assistant available to answer procedural questions. Nobody with authority over
   the reviewer is involved.
f) **When the person is approached.** After the corpus has been generated and
   internally audited, i.e. before any review work begins. They are contacted a
   second time at the end, solely to confirm permission to be named in the
   acknowledgements.
g) **Method used to ensure full understanding.** A written orientation containing
   (i) definitions of all eleven violation policies, (ii) two or three worked
   examples with their expected verdicts, (iii) an explanation of the three answer
   options including that `?` is a legitimate and useful answer, and (iv) an open
   invitation to ask questions before starting. The reviewer keeps the definitions
   beside the sheet throughout. The first few rows are treated as a pilot: they are
   discussed (not scored against the reviewer) so that any misunderstanding is
   corrected before the full batch.

### B. Risks and Side Effects *(applies to studies using human subjects)*

**Not applicable to human subjects.** No participant is exposed to any procedure,
substance, device or intervention, so the medical, psychological, legal, financial
and social risks this section anticipates do not arise. The only person with any
involvement is the expert reviewer, whose risks are limited to those below and are
judged negligible:

1. **Potential risks (reviewer only).**
   a) *Severity and likelihood:* (i) **time burden / cognitive fatigue** — low
      severity, moderately likely over 370 rows; (ii) **discomfort from reading
      adversarial text** — the material is synthetic, bureaucratic and non-graphic
      (scope creep, retention, sharing scenarios), with no personal data and no
      violent content — low severity, low likelihood; (iii) **perceived judgement of
      competence** — if their verdicts disagree with the corpus, they might feel
      their expertise is being measured — low severity; (iv) **legal or financial
      risk** — none: the reviewer never handles real data, real systems, or anything
      confidential.
   b) *Procedures for protecting against or minimising risks:* the sheet is split
      into batches so sessions can be short (30–60 minutes); breaks and stopping at
      any point are explicitly allowed; `?` is a fully acceptable answer, so no one
      is forced to guess; the sheet is blind, so there is no "wrong" answer relative
      to a machine; verdicts are reported **only in aggregate** (e.g. "agreement 90%,
      95% CI …"), never as an individual score; no personal data are recorded
      alongside their answers; the researchers review the sample before sending it
      and will remove or reword any item that could reasonably distress a reader;
      the reviewer may request a redaction at any time.
   c) *Alternative procedures:* not applicable — there is no treatment to
      substitute. The only alternatives are to decline, or to stop, both of which the
      reviewer may choose freely.
   d) *Unforeseen risks:* considered unlikely, because the study involves no
      intervention, no measurement of a person, and text that is synthetic. Should
      anything unforeseen occur, the monitoring and reporting steps in (8) apply.
   e) *Time to be spent by the participant:* there are no survey questionnaires and
      no interviews or focus group discussions. The only person spending time is the
      expert reviewer, at an estimated **roughly 30–60 seconds per row and about
      4–8 hours in total** for the ≈370-row sample, spread over as many sittings as
      they wish.
2. **Adverse events.** *Defined for this study as:* any event in which the study
   causes harm, distress or loss of privacy to any person (including the reviewer),
   or any incident that invalidates the integrity of the data or results. None are
   anticipated; the expected frequency is zero.
   a) *Provisions for medical and professional intervention:* no medical procedure
      exists and no physical risk is present, so no medical provision is required. If
      the reviewer experiences distress of any kind, the review stops immediately;
      they are free to consult the university's guidance/wellness service or their
      own physician, and the team will facilitate and cover the cost of that
      consultation if it arises from the review.
   b) *Reporting adverse events:* reported by the project leader to the research
      adviser and the ethics committee within 24–48 hours, with a short written
      account of what happened and what was changed. Label errors found during the
      review that would change a reported conclusion are reported on the same basis
      and corrected by re-running and issuing an erratum note.
3. **Compensation for injuries.**
   a) *Where and from whom medical therapy may be obtained:* not applicable — the
      study has no physical component. A person needing care may seek it from any
      hospital or clinic, or from the university health/counselling service.
   b) *Who will pay for the therapy:* the study carries no physical risk and no
      exposure to injury, so no injury-compensation provision is warranted; should an
      incidental cost nevertheless arise from taking part, the researchers will
      shoulder it as a matter of fairness. This is stated for completeness, not as a
      liability mechanism.
   c) *Whom to contact in case of injury or concern:* the Project Leader,
      `[name]`, `[email]`, `[contact number]`; then the Research Adviser, `[name]`,
      `[email]`; then the Ethics Review Committee secretariat, `[contact]`.

### C. Benefits to Subjects *(applies to studies using human subjects)*

**No human subjects, therefore no subject benefits in the usual sense.** Nobody
gains or loses health, money, care, or access to services by taking part, because
nobody "takes part" as a subject.

* **Benefit to the person involved (the expert reviewer):** professional rather than
  personal — they receive the complete validated corpus and the study's findings
  ahead of release, are named in the acknowledgements with their permission, and
  gain a compact, reusable reference on delegation-violation taxonomy (the policy
  matrix and worked examples). No monetary benefit attaches to it.
* **Benefit to general science and to others:** an expert-checked dataset and a
  reproducible benchmark for agent-delegation security; a documented
  positive-or-negative result about whether contrastive embeddings beat NLI at this
  task; and a working reference implementation that other researchers and
  practitioners can inspect, re-run and deploy. Society benefits when AI agents
  that touch people's records can be shown to stay inside their authority.
* **No exploitative framing:** nothing is offered in a way that pressures anyone to
  participate, and nothing is withheld from someone who declines.

### D. Costs to Subject *(applies to studies using human subjects)*

1. **There are no costs to any person.** No participant incurs any financial cost:
   no internet load or data charges beyond ordinary use of a computer, no
   subscription, no new software, no printing, no travel, and no time lost from paid
   work on the study's schedule. The review sheet is a plain CSV that opens in free
   software already on the reviewer's machine (Excel, Google Sheets, or any text
   editor). If the reviewer prefers to work from printouts, or on a machine they do
   not own, the researchers provide that at their own expense.
   a) *Justification for any costs:* none to justify. Stated plainly: nobody pays
      anything to be part of this study, and the study does not buy anything from
      anyone.

### E. Compensation to Subject *(applies to studies using human subjects)*

**The researchers will not provide compensation to subjects/participants, because
there are no subjects/participants to compensate.** No money, tokens, gifts, load,
or service credits are offered or paid to anyone, and nothing is contingent on
completing the review.

a) *Schedule of payments based on completion or partial completion:* not
   applicable — no payment exists, so there is no schedule.
b) If the committee prefers that the expert's time be formally recognised, two
   pre-declared options exist, disclosed *before* the review begins and never
   conditioned on a particular verdict: **(i) non-monetary recognition** — named
   acknowledgement in the thesis and in any resulting publication (only with
   consent), a copy of the final corpus and results, and consideration as a
   contributor/co-author where institutional authorship rules allow; or **(ii) a
   modest honorarium** at the institution's standard consultancy rate, paid
   regardless of how much of the sheet is completed. Either option is small enough
   not to constitute an inducement, and no vulnerable person or dependent relies on
   it.

### F. Provisions for Vulnerable Subjects *(applies to studies using human subjects)*

**There are no vulnerable subjects in this study.** No minors, no senior citizens
as subjects, no persons with disabilities as subjects, no indigenous peoples, no
prisoners or detained persons, no economically disadvantaged persons, no patients,
and no employees or students of the researchers are enrolled as research subjects.
Indeed, **no one at all** is enrolled as a research subject.

*Safety net if that ever changed:* any person contributing to the study must be a
consenting adult acting voluntarily, with full information as described in (A).
If a contributor ever belonged to a group the committee considers vulnerable, the
additional protections applied would be: an independent witness present at the
briefing, an explicit written statement of rights, the unconditional right to
withdraw at any time without giving a reason and without consequence, a shortened
workload, the ability to answer `?` rather than guess, and no recording of anything
beyond verdicts on dataset rows. The project leader and the research adviser are the
points of contact for any concern raised by a contributor or their guardian.

### G. Subject Privacy and Data Confidentiality

1. **Privacy of participants.** There are no personal data to protect. The corpus is
   synthetic text about abstract service scenarios (for example, "process disability
   benefits for a veteran"); the generation prompt explicitly forbids inventing
   identifiers or placeholder personal details (no "John Doe", no "123456", no
   "123 Elm St"), and the validation step rejects rows that resemble such data. The
   review sheet is keyed by a dataset row number (`data_number`) only: the
   reviewer's name never enters the sheet, the dataset, or the results, and appears
   only in the acknowledgements and only with their permission. Nobody is observed,
   recorded, or questioned about themselves, and no real records — medical,
   financial or government — are read by any person at any point in the study.

2. **Confidentiality of data.**
   a) **How the data will be disseminated; sharing outside the institution.**
      Results are reported as **aggregate statistics** — means, standard deviations,
      confidence intervals, p-values, confusion matrices — in the thesis, at the
      oral defense, in research presentations, and in a peer-reviewed
      journal/conference publication. The **synthetic corpus** may be released
      publicly, because it contains no personal data and no confidential third-party
      material, and it is released together with its generation method so that it can
      be cited and reused. The benchmark material (DelegationBench v4) is used and
      cited under the original author's permission and is **not redistributed**
      beyond what that permission allows; the study reproduces its metrics instead.
      No raw third-party records are shared with anyone, because none exist.
      i. **Will data be identified?** No. There are no personal identifiers anywhere
         in the study; records are keyed by an internal row number. The single
         person-identifying element in the entire project is the expert reviewer's
         name in the acknowledgements, included only with consent.
      ii. **How data will be kept secure (where it is stored).** On the
         researchers' own local machines and in a **private, access-controlled Git
         repository**; no cloud storage, no public links, and no public release
         during the study. Credentials and environment files (API keys, `.env`) are
         excluded from version control. The review sheet travels through a direct,
         access-controlled channel (email attachment or the institution's own file
         service) in both directions. Work is committed regularly, so the data
         cannot be silently lost.
      iii. **Who will have access to the data.** The project leader, the
         co-proponents and research assistants, and the research adviser; the defense
         panel for the documents under review. The external expert reviewer sees only
         the review sheet — no results, no predictions, no personal data. No other
         party receives access without the adviser's and the committee's approval.

3. **Plan for record retention and disposal.** Records are kept for the duration of
   the study and for `[one (1) year]` after the final defense, or for whatever longer
   period institutional policy or a journal's data-availability requirement demands.
   Digital records are then deleted from every location that held them, including
   backups, and the private repository is removed or archived according to policy;
   paper copies (for example, a printout the reviewer used) are shredded. Model
   weights are regenerable from the committed scripts and may be deleted earlier.
   Because nothing contains personal data, disposal carries no privacy risk. What
   may be retained permanently is only the aggregate results and, if approved, the
   synthetic corpus in its de-identified-by-construction form as a published
   research dataset.

4. **Limits to confidentiality.** Three honest limits, all disclosed to the people
   concerned in advance: (i) results are reported only in aggregate, but the expert
   reviewer is named in the acknowledgements with their consent, so their
   involvement becomes publicly visible and could be inferred by colleagues — they
   are told this before agreeing; (ii) if a journal or the institution requires
   summary statistics or the released corpus for verification, those are shared (no
   personal data are involved); (iii) if the ethics committee, the adviser, or the
   institution requires access to study records for monitoring, auditing or legal
   reasons, that access is given. No mandatory-reporting duty is triggered anywhere
   in this study, because it involves no illegal activity and no identifiable
   person's private information; nothing that would have to be "broken in
   confidence" can arise.

---

## (11) Plan for Dissemination of Findings

1. **Institutional presentation and defense.** The completed manuscript will be
   submitted to the thesis panel and defended orally. A bound/electronic copy is
   filed with the department and the school library, and an electronic copy is
   deposited in the institution's research repository, following the school's
   requirements.
2. **Paper presentation.** Results will be presented at the department's research
   forum/colloquium, and submitted to `[national/international conference on AI,
   computing, or information security]` once the call for papers is appropriate. The
   presentation includes, where facilities allow, a short live demonstration of the
   working gateway (console → API gateway → inference service) showing an
   adversarial paraphrase being blocked.
3. **Publication.** The study is intended for publication in a peer-reviewed journal
   or conference proceedings in applied machine learning / AI security. Authorship
   follows each member's contribution, with the adviser included per institutional
   policy. If the work is not accepted by a venue within the study window, the
   manuscript is still deposited in the school's repository and the result — whether
   it favours the proposed architecture or not — is reported as measured, since a
   null or negative result on adversarial-paraphrase detection is itself a
   contribution.
4. **Artifact release for reproducibility.** After the defense, and subject to any
   embargo a publication venue imposes, the following are released in a public
   repository (for example a version-tagged Git repository) so others can re-run the
   experiment: the training and evaluation scripts, the model configuration
   including the calibrated thresholds and their metrics, the experiment paper
   data, the review-sheet template and its scoring script, and the
   **expert-validated synthetic corpus**. Releasing the corpus raises no privacy
   issue because it is synthetic and contains no personal data. DelegationBench v4
   is not redistributed in breach of the original author's terms; the study's
   reproduction of its baseline metrics is cited and reported instead.
5. **Feedback to contributors and data sources.** The expert reviewer receives a copy
   of the validation report — agreement rate, margin of error, confidence level, and
   per-policy disagreement — together with the final manuscript. The original author
   of DelegationBench v4 is informed of the results of the study built on the
   benchmark, and is offered a copy of the manuscript. Any partner or agency whose
   material is used in future (none at present) would receive the same courtesy.
6. **Beneficiaries of the dissemination.** Researchers in agent security and in
   embedding/NLI evaluation gain a reproducible benchmark; practitioners deploying
   agent guardrails gain an open reference implementation with calibrated
   thresholds; the general public benefits indirectly, because better-verified
   agents are less likely to expose their records.
7. **Intellectual property and restrictions.** No patent application, licensing
   restriction, or confidentiality agreement limits the publication of these
   findings. The project builds on open-source tooling (Python, PyTorch,
   sentence-transformers, FastAPI, Node/Express, Next.js), whose licences are
   respected and which are attributed in the manuscript's references and
   acknowledgements. Findings are disseminated only after the panel's approval, and
   nothing is published in a form that overstates what was measured.

---

## (12) References

*APA 7th edition. Entries are alphabetical by first author; apply a 0.5-inch hanging
indent when pasting into the manuscript. Every source cited in items (5)–(11)
appears here. Four items still needing a source or a correction are listed at the
end of this section.*

Chanchani, S., & Huang, R. (2023). Composition-contrastive learning for sentence
embeddings. In *Proceedings of the 61st Annual Meeting of the Association for
Computational Linguistics (Volume 1: Long Papers)* (pp. 15836–15848). Association
for Computational Linguistics. https://doi.org/10.18653/v1/2023.acl-long.882

Cochran, W. G. (1977). *Sampling techniques* (3rd ed.). John Wiley & Sons.

Du, M., He, F., Zou, N., Tao, D., & Hu, X. (2024). Shortcut learning of large
language models in natural language understanding. *Communications of the ACM,
67*(1), 110–120. https://doi.org/10.1145/3596490

Hugging Face. (n.d.). *cross-encoder/nli-MiniLM2-L6-H768* [Model card]. Retrieved
from https://huggingface.co/cross-encoder/nli-MiniLM2-L6-H768

Hugging Face. (n.d.). *sentence-transformers/all-MiniLM-L12-v2* [Model card].
Retrieved from https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2

Jurafsky, D., & Martin, J. H. (2026). *Speech and language processing: An
introduction to natural language processing, computational linguistics, and speech
recognition with language models* (3rd ed. draft). Stanford University.
https://web.stanford.edu/~jurafsky/slp3

Liu, A., & Meng, J. (2026). *Paraphrase-induced output-mode collapse: When LLMs
break character under semantically equivalent inputs* [Preprint]. arXiv.
https://arxiv.org/abs/2605.04665

McCoy, R. T., Pavlick, E., & Linzen, T. (2019). Right for the wrong reasons:
Diagnosing syntactic heuristics in natural language inference. In *Proceedings of the
57th Annual Meeting of the Association for Computational Linguistics*
(pp. 3428–3448). Association for Computational Linguistics.
https://doi.org/10.18653/v1/P19-1334

Nie, Y., Williams, A., Dinan, E., Bansal, M., Weston, J., & Kiela, D. (2020).
Adversarial NLI: A new benchmark for natural language understanding. In
*Proceedings of the 58th Annual Meeting of the Association for Computational
Linguistics* (pp. 4885–4901). Association for Computational Linguistics.
https://doi.org/10.18653/v1/2020.acl-main.441

OpenJS Foundation. (n.d.). *Express* [Computer software]. Retrieved from
https://expressjs.com

Patil, K. (2026). *SentinelAgent: Intent-verified delegation chains for securing
federal multi-agent AI systems* [Preprint]. arXiv.
https://arxiv.org/abs/2604.02767

PyTorch Foundation. (n.d.). *PyTorch* [Computer software]. Retrieved from
https://pytorch.org

Ramírez, S. (n.d.). *FastAPI* [Computer software]. Retrieved from
https://fastapi.tiangolo.com

Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence embeddings using
Siamese BERT-networks. In *Proceedings of the 2019 Conference on Empirical Methods
in Natural Language Processing and the 9th International Joint Conference on
Natural Language Processing (EMNLP-IJCNLP)* (pp. 3982–3992). Association for
Computational Linguistics. https://doi.org/10.18653/v1/D19-1410

UKPLab. (n.d.). *sentence-transformers* [Computer software]. Retrieved from
https://www.sbert.net

Vercel. (n.d.). *Next.js* [Computer software]. Retrieved from https://nextjs.org

Wang, W., Wei, F., Dong, L., Bao, H., Yang, N., & Zhou, M. (2020). MiniLM: Deep
self-attention distillation for task-agnostic compression of pre-trained
transformers. In *Advances in Neural Information Processing Systems 33*.
Curran Associates.
https://proceedings.neurips.cc/paper/2020/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html

Wilson, E. B. (1927). Probable inference, the law of succession, and statistical
inference. *Journal of the American Statistical Association, 22*(158), 209–212.
https://doi.org/10.1080/01621459.1927.10502953

Yang, Y., Zhang, Y., Tar, C., & Baldridge, J. (2019). PAWS-X: A cross-lingual
adversarial dataset for paraphrase identification. In *Proceedings of the 2019
Conference on Empirical Methods in Natural Language Processing and the 9th
International Joint Conference on Natural Language Processing (EMNLP-IJCNLP)*
(pp. 3687–3692). Association for Computational Linguistics.
https://doi.org/10.18653/v1/D19-1382

Zhang, Y., Baldridge, J., & He, L. (2019). PAWS: Paraphrase adversaries from word
scrambling. In *Proceedings of the 2019 Conference of the North American Chapter of
the Association for Computational Linguistics: Human Language Technologies, Volume 1
(Long and Short Papers)* (pp. 1298–1308). Association for Computational Linguistics.
https://doi.org/10.18653/v1/N19-1131

### Items still to be confirmed before submission

1. **"Siu et al., 2025"** appears in the *thesis* (Theoretical Framework: "Patil,
   2026; Siu et al., 2025") but not in this ethics form. No 2025 first-author Siu
   item could be located; the verifiable works are Siu et al. (2026) — *A framework
   for formalizing LLM agent security* (arXiv:2603.19469) and *Agent security needs
   redefinition through a holistic framework* (arXiv:2607.22024). **Recommendation:**
   cite the 2026 items and correct the year throughout.
2. **"Dorr et al., 2026"** (thesis, on Authorization Drift under adversarial
   paraphrasing) could not be matched to any published record. Supply the full
   bibliographic details from the team's bibliography, or replace the citation with
   a verifiable work on the same concept (for example, runtime authorization
   consistency checking for agentic workflows, arXiv:2609.23498).
3. **The "2026 clinical text classification study"** referenced in item (7) F
   (600 examples reaching 95% of achievable performance for 10 of 11 modelled
   diagnoses) originates from the corpus design plan (`data-gen/implementation.md`)
   without a citation. Either supply the source, or reword the sentence so the
   figure is presented as an internal design rationale rather than published
   evidence.
4. **"Du et al., 2023"** in item (5) follows the arXiv preprint's year; the
   published version is 2024 (*Communications of the ACM, 67*(1)). Align the in-text
   citation and the reference entry to a single year.

---

*Prepared against `ethics.md` items (5)–(12). Item (13) Appendices is supplied
separately and should attach (i) the reviewer information-and-agreement sheet from
(10) A, (ii) the expert review sheet template with its instructions and policy
definitions, and (iii) the experiment paper (format in `training/Thesis.md`,
Appendix 2).*
