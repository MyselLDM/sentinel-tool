

# **Semantic Verification of Authorization Alignment in Agent Delegation using Contrastive Embeddings**

# 

A Thesis  

## **Theoretical Framework** {#theoretical-framework}

Figure 1\. Theoretical Framework

## 

##


	The integration of Large Language Models (LLMs) into autonomous agentic workflows introduces critical security vulnerabilities, particularly when agents are granted permission to execute database or system commands based on natural language prompts (Patil, 2026; Siu et al., 2025). Currently, the industry standard for securing these delegations relies on NLI to verify if a user's prompt matches an authorized intent. However, reviewed NLI models do not directly enforce compositional semantics or verify operational boundaries, which causes Authorization Drift under adversarial paraphrasing (Dorr et al., 2026). This research grounds the failure of NLI, and the subsequent architectural solution, in three foundational theories of computational linguistics and machine learning.

**Shortcut Learning and Spurious Heuristics** 

	Shortcut Learning and Spurious Heuristics The first theoretical limitation is the reliance on shortcut learning (Du et. al., 2023). Rather than performing deep logical deduction, NLI models often rely on dataset biases, specifically the lexical overlap heuristic (McCoy et al., 2019). The model assumes that if a premise and a hypothesis share a high percentage of the same words, they must be an "entailment" (a logical relationship where the truth of one statement, which is the premise, guarantees the truth of another). Consequently, when an adversary subtly alters the operational meaning of a prompt (e.g., expanding a database query) while maintaining the original vocabulary, the NLI model is mathematically biased to ignore the logical contradiction and authorize the action.

**Surface Form Sensitivity and Output Mode Collapse** 

	Secondly, generative LLMs and NLI models are highly sensitive to how a prompt is worded, often focusing more on the exact phrasing than on the actual meaning or intent behind it (Liu & Meng, 2026). Under adversarial paraphrasing, these generative models often stop following their expected response format (such as returning a simple Yes/No authorization decision) and instead generate free-form conversational text. This breakdown in structural discipline causes automated exact-match security pipelines to fail.

**The Absence of Compositional Semantics** 

	Finally, reliable logical verification depends on understanding how each individual word and phrase contributes to the overall meaning of a statement (Jurafsky & Martin, 2026). NLI models, however, tend to evaluate sentences based on their overall meaning and similarity rather than carefully examining the logical role of each individual word. Because they measure general "semantic relatedness" rather than isolating structural variables, they suffer from compositional blindness (Chanchani & Huang, 2023). This makes them highly vulnerable to single-word qualifier injections, such as changing "retrieve this file" to "retrieve all files," which drastically alter the authorization boundary without triggering the model's holistic similarity alarms.

	To neutralize the theoretical vulnerabilities of NLI, this study proposes a shift from probabilistic entailment to mathematical distance verification through a dedicated contrastive metric learning architecture. To address the absence of compositional semantics and defeat the lexical overlap heuristic, the proposed system abandons general similarity scoring. Instead, the model is optimized via hard-negative mining using highly specific (Anchor, Positive, Negative) training triplets. This mathematically penalizes the model for placing adversarial prompts near authorized commands just because they share vocabulary (Chanchani & Huang, 2023). Furthermore, to eliminate surface form sensitivity and output mode collapse, the contrastive model does not generate text; it maps instructions into a continuous mathematical vector space. Benign paraphrases (Positives) are clustered tightly around the authorized command (Anchor), while unauthorized scope expansions (Negatives) are forcefully pushed across a strict spatial boundary. By converting semantic intent into deterministic spatial distance, this contrastive alignment allows the system to recognize true operational equivalence, granting it the structural discipline necessary to reliably detect and block Authorization Drift.

## **Conceptual Framework** {#conceptual-framework}

Figure 2\. Conceptual Framework

## 

	Figure 2 presents the conceptual framework of the study, which follows a structured Input-Process-Output flow. This framework maps out the systematic workflow used to verify authorization alignment in agent delegation through contrastive metric learning.

	The framework begins with the input phase, which centers on the DelegationBenchv4 dataset. DelegationBenchv4 is a purpose-built dataset of delegation scenarios within the context of federal government services. Each record in the dataset consists of a root delegation goal, a subtask description, and a ground-truth label indicating whether the subtask represents a benign entailment, a benign neutral operation, or a malicious contradiction of the delegated authority. The dataset includes both legitimate delegation patterns and adversarial examples such as data exfiltration, bias injection, privilege escalation, and adversarial paraphrases that use professional-sounding language to disguise harmful intent. This dataset serves as the single source of truth from which all subsequent preparation, model training, and evaluation stages derive their data.

	The process phase constitutes the core of the framework and diverges into two distinct evaluation pipelines, the baseline path and the solution path, before converging for evaluation and statistical analysis.

	The baseline execution path establishes the NLI Baseline, which operates without contrastive embeddings. In this path, data preparation consists of text normalization to eliminate case-related variability, followed by a standard train-test split. Each delegation scenario is formatted into a natural language inference sentence pair, where the premise describes the authorized goal and the hypothesis describes the subtask being performed, and the associated label if it is benign or malicious. A pre-trained cross-encoder NLI model is loaded in and applied directly to classify each sentence pair into one of three NLI categories: contradiction, entailment, or neutral. Because this baseline does not apply contrastive metric learning to refine the embedding space, it serves as the performance reference against which the proposed solution is measured.

	The proposed execution path implements the contrastive architecture and begins with a dedicated data labeling stage. Because contrastive learning requires highly specific relational data, the original dataset is restructured into triplets. The original root delegation goal from the dataset is established as the anchor. A benign, authorized subtask that safely executes the goal is mapped as the positive, while a malicious or unauthorized subtask (e.g. adversarial paraphrase that expands the scope) is explicitly mapped as the negative. Following this labeling, the solution path undergoes its following steps, applying the same text normalization and train-test split as the baseline.

	In the contrastive metric learning stage, these prepared text triplets (anchor, positive, negative) are fed directly into a MiniLM-based sentence transformer to train its weights using a contrastive learning objective. Instead of using a separate tool to break the sentence apart and highlight the key variables, the model must figure out the exact limits of what is allowed directly from the raw text. The contrastive loss function trains the model to learn an optimized embedding space where the operational limits of the anchor dictate spatial distance. Authorized delegation pairs (the anchor and positive) are pulled closer together, while unauthorized or adversarial pairs (the anchor and negative) are forcefully pushed apart. By training directly on these targeted triplets, the model learns to identify true operational equivalence and semantic violations, overriding the false lexical overlap heuristics that deceive standard NLI models (Du et al., 2023).

	Both the baseline path and the solution path converge at the evaluation metrics stage, where the same set of performance measures is computed for each approach. Recall measures the proportion of actual malicious delegations that are correctly identified as unauthorized so that adversarial instructions are not missed. Precision measures the proportion of flagged delegations that are genuinely unauthorized to assure that legitimate delegations are not incorrectly blocked. F1-Score is the harmonic mean of recall and precision which provides a single balanced metric that accounts for both threat detection and false positive avoidance.

	Following the computation of evaluation metrics, the framework proceeds to the statistical analysis stage. A one-tailed paired t-test is applied to assess whether the solution path achieves a statistically significant improvement over the baseline. The one-tailed formulation is chosen because the hypothesis is directional: the study proposes that the contrastive embedding architecture will yield higher performance than the standard NLI baseline. The resulting p-value is compared against the significance threshold to render a null hypothesis decision, this will determine whether to reject or fail to reject the null hypothesis that there is no performance difference between the two approaches.

	The output phase captures the final deliverables of the framework. The baseline NLI results present the recall, precision, and F1-Score achieved by the standard NLI model. The contrastive model solution results present the same metrics achieved by the proposed approach. The one-tailed paired t-test results report the t-statistic and p-value from the statistical comparison. Finally, the Hypothesis Decision states whether the null hypothesis is rejected or failed to be rejected. This will provide the definitive conclusion regarding the significance of the proposed solution's improvement over the baseline.

## [**Statement of the Problem**](?tab=t.brbfwsbm9lib#bookmark=id.6z9o7o4v1y6b) {#statement-of-the-problem}

	This study aims to verify authorization alignment in agent delegation by evaluating a contrastive embedding model against a standard Natural Language Inference (NLI) baseline. Specifically, a MiniLM sentence transformer is fine‑tuned with a contrastive learning objective on delegation‑specific (anchor, positive, hard‑negative) triples to distinguish scope‑preserving paraphrases from scope‑expanding adversarial paraphrases, and the study determines whether there is a significant difference between the baseline NLI model and the proposed contrastive model in terms of Recall, Precision, and F1‑Score. Specifically, this study seeks to answer the following questions:

1. What is the detection performance of the baseline NLI‑based intent verification (SentinelAgent P2) under adversarial paraphrasing and normal conditions, in terms of:  
   1. True Positive Rate (Recall);  
   2. Precision;  
   3. F1‑Score?  
2. What is the detection performance of the proposed contrastive embedding model under the same adversarial paraphrasing and normal conditions, in terms of:  
   1. True Positive Rate (Recall);  
   2. Precision;  
   3. F1‑Score?  
3. Is there a significant difference in the performance of the baseline NLI‑based model and the proposed contrastive embedding model under adversarial paraphrasing and normal conditions, in terms of:  
   1. True Positive Rate (Recall);  
   2. Precision;  
   3. F1‑Score?

**Hypotheses**

The study will test the following hypotheses for RQ3:

* **H₀:** The proposed contrastive embedding model **does** **not** improve the true positive rate compared to SentinelAgent's NLI‑based model under adversarial paraphrasing and normal conditions.  
* **H₁:** The proposed contrastive embedding model **does** improve the true positive rate compared to SentinelAgent's NLI‑based model under adversarial paraphrasing and normal conditions.

**Scope and Limitation of the Study**

	This study serves as a technical proof‑of‑concept focused on improving semantic intent verification in AI agent delegation systems. It replaces the original NLI‑based P2 with a contrastive embedding model because NLI has been shown to collapse to 13 % TPR under adversarial paraphrasing (Patil, 2026). The work is strictly limited to the probabilistic intent verification component (P2) of the SentinelAgent framework. The deterministic enforcement layers, authority monotonic narrowing (P1), policy conjunction preservation (P3), forensic chain reconstruction (P4), bounded cascade containment (P5), scope‑action conformance (P6), and output schema conformance (P7), are accepted as proven baselines that already achieve a 100 % true positive rate on rule‑based violations (Patil, 2026); therefore, they will not be re‑implemented or evaluated. This deliberate narrowing isolates the specific semantic security gap.

	The proposed architecture consists of a MiniLM sentence transformer fine‑tuned with a contrastive learning objective on delegation‑specific triples. MiniLM is chosen for its small memory footprint and fast CPU‑only inference, making the approach feasible for offline evaluation without specialised hardware. Additionally, selecting MiniLM aligns the proposed architecture with the baseline established by the SentinelAgent framework, ensuring a fair and direct methodological comparison. The contrastive learning objective is selected because it directly trains the model to distinguish authorization‑preserving paraphrases from scope‑expanding ones by pulling authorised pairs together and pushing unauthorised pairs apart in embedding space, a distinction that standard NLI models fail to learn. The training data is organised as (anchor, positive, hard‑negative) triples: the anchor is the original authorised goal, the positive is a benign, scope‑preserving paraphrase, and the hard negative is an adversarial, scope‑expanding paraphrase. This triple format ensures that the model receives explicit supervision on the exact boundary between safe and unsafe instruction variants.

	Adversarial evaluation is restricted to the class of attacks that cause SentinelAgent’s P2 to collapse, specifically, scope‑expanding paraphrases that maintain surface‑level semantic similarity. The study will not cover other attack vectors such as data poisoning, white‑box model extraction, or multi‑turn adaptive attacks. This restriction ensures the evaluation directly targets the failure mode defining the current semantic gap (13 % TPR) and avoids diluting the study’s focus with threats that are outside the semantic verification layer.

	The sole evaluation dataset is the intent‑verification subset of DelegationBench v4 (Patil, 2026), providing a reproducible set of 200 delegation scenarios comprising 60 malicious and 140 benign instances. This dataset is chosen because it is the only public benchmark that contains delegation‑specific adversarial paraphrases and provides a documented NLI baseline, allowing a direct and fair comparison of the proposed model against prior work. To ensure rigorous evaluation given the modest dataset size, the dataset is evaluated using 5‑fold stratified cross‑validation, which guarantees that every example is used for testing exactly once and that the class distribution (attack vs. benign) is preserved in every fold.

	Performance will be assessed using True Positive Rate (Recall) as the primary metric because the security gap is defined by missed violations, the 87 % of adversarial paraphrases that currently slip through. Recall directly measures what fraction of those previously invisible attacks the model now catches. Precision is reported as the guardrail to ensure that high recall is not achieved by simply flagging every input as malicious; it measures the proportion of flagged instructions that are genuinely unauthorised. F1‑Score is the harmonic mean of the two, providing a single balanced summary when a trade‑off between recall and precision exists. Accuracy is not used because the dataset is class‑imbalanced (140 benign, 60 malicious); a model that always predicts “benign” would obtain 70 % accuracy but 0 % recall, which is misleading. These three metrics together give a complete picture of both detection power and false‑alarm control.

	The performance of the contrastive model is directly compared against the NLI baseline (SentinelAgent P2) on the same test folds. This baseline is the current state‑of‑the‑art for probabilistic intent verification and has published, reproducible metrics on DelegationBench v4. Comparing identical data partitions ensures that any difference in recall, precision, or F1 is attributable to the change in verification architecture rather than to differences in the evaluation data. Statistical significance of the improvement will be tested using a one‑tailed paired‑sample t‑test on the fold‑level differences in Recall, Precision, and F1‑Score (α = 0.05). The paired design is appropriate because both models are evaluated on exactly the same test folds, which controls for variability across data splits and increases the sensitivity of the comparison.

	The study is conducted entirely offline on pre‑labeled instruction pairs. No live agent deployment, real‑time inference pipeline, or integration with a Delegation Authority Service is implemented. This offline setup eliminates confounding variables such as network latency, token expiration, and adaptive adversary behaviour, allowing the evaluation to isolate the decision quality of the contrastive model itself. Operational issues such as inference latency, token expiry, or adaptive adversaries are therefore out of scope. The research concentrates exclusively on the semantic alignment aspect of the delegation‑observability gap; application to general prompt injection or external data sanitization is outside the study’s purview because those problems involve different attack mechanisms that are not captured by the adversarial paraphrasing benchmark used here.

	The results are intended to demonstrate that contrastive embedding training can substantially improve detection performance, specifically in terms of Recall, Precision, and F1‑Score, compared to the existing NLI baseline.

# **Chapter 3** **METHODOLOGY** {#chapter-3-methodology}

## **Research Design**

This study will use an experimental and developmental research design. The developmental phase will center on the architecture and integration of an authorization alignment framework, specifically utilizing a contrastive metric learning architecture to enforce security policies during agent delegation. Concurrently, the experimental phase will measure the efficacy of this proposed framework when subjected to delegation scenarios and intent manipulation attempts, such as adversarial paraphrasing.

The evaluation will compare two distinct intent verification approaches. The primary baseline configuration will serve solely as a performance benchmark and will represent the current probabilistic approach implemented through a standard NLI model. The secondary configuration will implement the newly developed solution, replacing this generalized approach with a MiniLM-based contrastive embedding model trained on task-specific delegation triplets. This comparative setup ensures a clear demonstration of the performance gains achieved by transitioning from the baseline to the proposed methodology.

To structure the findings, the methodology is aligned with the study’s three guiding research questions. Research Question 1 will involve testing the baseline NLI framework against adversarial inputs, quantifying its performance using core metrics: True Positive Rate (Recall), Precision, and F1-Score. Research Question 2 will subject the proposed contrastive embedding framework to the exact same attack scenarios and performance metrics. Finally, to address Research Question 3, a statistical hypothesis test (one-tailed paired t-test) will be applied to the evaluation metrics to confirm whether the proposed framework yields a statistically significant improvement over the baseline.

To guarantee rigorous experimental integrity, the methodology establishes a definitive separation between the training and inference phases for both the Natural Language Inference baseline and the MiniLM contrastive model. All experimental procedures will be performed within a secured, offline simulation environment relying entirely on the established benchmark dataset. The study will not interact with live web traffic, nor will it capture real-time user prompts. Batch-level inference logs generated during the simulation will serve as the empirical foundation for all subsequent descriptive statistics and significance testing.

## **Sources of Data**

This research relies exclusively on the DelegationBenchv4 dataset, a comprehensive dataset specifically curated for evaluating agent delegation security. This dataset encompasses labeled instructional text records detailing various delegation intents, including both benign, authorized user requests and adversarial manipulations such as scope-expanding paraphrases. Rather than serving merely for standard fine-tuning, this dataset acts as the structural substrate from which the targeted (anchor, positive, negative) triplets are extracted to drive the model's contrastive optimization and facilitate the overall architectural evaluation.

## **Sampling Data**

Prior to model training and evaluation, the DelegationBenchv4 dataset will undergo a preprocessing pipeline. Initial text normalization will be applied across all textual fields to eliminate case-related variability. Any non-essential metadata or uninformative identifier columns will be stripped. Textual records containing empty strings, malformed formatting, or missing critical features will be systematically removed prior to training. The study will forgo any automated text imputation methods to ensure the semantic integrity of the dataset remains intact.

Following this initial cleaning phase, the data will be formatted according to the specific requirements of the two evaluation pipelines. For the baseline Natural Language Inference path, each delegation scenario will be structured into a standard sentence pair consisting of a premise and a hypothesis. The authorization labels will be strictly binarized, designating benign instructions as class 0 and adversarial instructions as class 1, with adversarial manipulation consistently treated as the positive class. Conversely, for the proposed contrastive execution path, the dataset will undergo a dedicated data labeling (validated by a subject matter experts) stage to restructure the records into training triplets. The original root delegation goal will be established as the anchor, a benign subtask will be mapped as the positive, and a malicious adversarial paraphrase will be mapped as the negative.

The refined dataset will then be partitioned utilizing a stratified 70/30 train-test split. Specifically, 70% of the dataset will be allocated to the training subset, with the remaining 30% reserved for the evaluation subset. This stratified sampling strategy guarantees that the proportional distribution of benign and adversarial instructions is preserved identically across both data partitions. The training subset will be utilized exclusively to optimize the verification models and establish semantic reference boundaries. The evaluation subset will be strictly isolated for framework assessment and the calculation of final performance metrics.

Finally, evaluation batches will be constructed exclusively from the held-out 30% evaluation subset. Each batch will be structured to contain both benign and adversarial instruction samples to ensure the accurate derivation of the core performance metrics: True Positive Rate (Recall), Precision, and F1-Score. To guarantee a direct and fair comparison, identical batches of samples will be processed sequentially through the baseline NLI configuration and the proposed contrastive MiniLM architecture. This synchronized paired batching methodology provides the rigorous statistical structure necessary to construct the paired comparison records and conduct the study's one-tailed paired t-test. 

## **System Architecture**

## Figure 3\. System Architecture {#figure-3.-system-architecture}

The proposed system follows a two-layer verification pipeline for the contrastive bi-encoder fine-tuned for delegation intent alignment.  The architecture describes both the inference-time decision flow and the measurable outputs produced for metric computation, covering the full path from user input to binary BLOCK/PASS verdict.

![][image1]

The figure presents the system architecture of the proposed contrastive intent verification pipeline for P2 intent preservation in federal multi-agent delegation chains.  The system is organized into three main stages: input acquisition, two-layer intent verification, and decision output.  Each component is described below with its inputs, internal operation, and outputs.

The system receives two inputs from the user. The first is the Goal ("goal\_text"), a delegation goal selected from a fixed catalog of 12 federal service processes ("Process disability benefits for veterans", "File federal tax return for citizens"). The catalog is predetermined and the goal is locked at delegation time. The goal defines the semantic anchor against which all subsequent subtasks are evaluated. The second is the Subtask ("subtask\_text"), a free-text instruction describing the action the user wants the agent to perform ("Retrieve the veteran's medical records from the VA health system"). This is the only dynamic input at runtime and is the vector through which adversarial intent drift or paraphrasing attacks would enter the system. Both inputs are submitted simultaneously to the Intent Verifier. The goal originates from a constrained dropdown selection; the subtask originates from an open text prompt.

It passes it to a contrastive bi-encoder that provides semantic intent alignment verification, the main contribution of the research. This layer detects adversarial paraphrases, scope-expanding language, and subtle intent drift that cannot be caught by substring matching alone, making it the primary P2 enforcement mechanism. The model used is all-MiniLM-L12-v2, a SentenceTransformer bi-encoder with a 12-layer MiniLM architecture producing 384-dimensional embeddings that is fine tuned. The inference operation proceeds through three sub-steps. First, both inputs are wrapped into a structured natural-language template in which the anchor text is constructed as "Goal: {goal}. Subtask: {goal}." and the subtask text as "Goal: {goal}. Subtask: {subtask}." Second, both document strings are independently encoded through the fine-tuned bi-encoder and L2-normalized to produce unit vectors. Third, the alignment between the goal and the subtask is computed as the dot product of the two normalized embedding vectors, producing a cosine similarity score in the range of \-1 to \+1. Because the model was trained with TripletLoss using cosine distance, benign subtasks are pulled toward the goal embedding and produce positive cosine values, while malicious subtasks are pushed away and produce negative cosine values. The natural decision boundary therefore falls at zero, where the vectors are orthogonal.

The cosine similarity is compared against a calibrated threshold. If the cosine falls below the threshold, the verdict is BLOCK; if it meets or exceeds the threshold, the verdict is PASS. The threshold is determined empirically through 5-fold cross-validation, following standard practice in contrastive representation learning where the decision boundary is treated as a hyperparameter optimized on held-out data rather than fixed a priori. During each fold, the threshold is swept across the interval from 0.0 to 1.0 in fine increments, and the value that maximizes the F1-score on the held-out test fold is selected. For final deployment, the threshold is set to the mean of the five fold-optimal values, which avoids overfitting the boundary to any single fold while remaining consistent with the literature on threshold selection for similarity-based classifiers, where the operating point is chosen to balance the precision-recall trade-off on a validation set. The resulting threshold produces a calibrated decision rule: subtasks whose embedding lies sufficiently far from the goal embedding are classified as malicious, while subtasks that share a meaningful directional component with the goal are permitted.

Once the Intent Verifier reaches a decision, the pipeline produces a binary output. A PASS verdict means the subtask semantically aligns with the original delegation goal, and proceeds to go to the original pipeline. A BLOCK verdict means an INTENT\_DRIFT violation is recorded from the cosine similarity, the user is notified, and the requested action is denied.

The pipeline produces measurable outputs for metric computation and statistical analysis. The per-fold cross-validation results file records TPR, FPR, F1, precision, accuracy, and threshold per fold, along with the aggregate confusion matrix across all folds. The full-dataset evaluation file reports per-fold model performance broken down by subset (all malicious entries, adversarial paraphrases, explicit attacks, and benign examples) and includes per-example cosine similarity and catch-or-miss status. A human-readable summary file provides the mean and standard deviation for all metrics across folds. These outputs allow direct comparison with the baseline off-the-shelf NLI model across the same evaluation subsets using the same metric schema.

The bi-encoder is trained separately from the inference pipeline described above, and the training methodology is summarized here for completeness. The training data consists of 200 verifiable delegation scenarios across 12 U.S. federal government service domains. During triplet construction, all benign subtasks under each of the 12 goals are collected as positives and all malicious subtasks are collected as negatives, with a configurable number of LLM paraphrases per goal sampled as additional negatives while original malicious entries are always retained. The Cartesian product of positives and negatives per goal produces the training triplets. The training configuration employs 5-fold stratified cross-validation with a validation hold-out, TripletLoss with cosine distance, and standard regularization hyperparameters to mitigate overfitting to the relatively small government delegation domain. A final model is trained on all available examples and saved for deployment.

## **Research Instrument**

The researchers used an experiment paper to gather and organize the empirical data from the batch-level evaluation process. This research instrument contained the quantitative data necessary to draw valid conclusions and ascertain if the findings aligned with the research hypotheses.

To address the specific research questions within the experiment paper, the researchers statistically measured the performance of the proposed contrastive MiniLM architecture using core performance metrics, specifically True Positive Rate (Recall), Precision, and F1-Score. Additionally, a one-tailed paired t-test was utilized to determine if there is a statistically significant difference in performance when compared to using the standard Natural Language Inference (NLI) model as the baseline.

## **Data Generation/Gathering Procedure**

The data generation and gathering procedure follows a strictly controlled, sequential methodology to ensure the integrity and reproducibility of the experimental findings. The process transitions from initial dataset acquisition to the automated generation of empirical performance metrics through offline simulation.

The procedure begins with the acquisition of the DelegationBenchv4 dataset. To maintain experimental control and prevent external variables or live network latency from influencing the study, the dataset is imported into a secure, offline simulation environment. All subsequent data manipulation and model execution occur entirely within this isolated setting.

The imported dataset undergoes immediate text normalization to remove case variability and nonessential metadata. Following this cleaning phase, the records are systematically formatted to satisfy the input requirements of the two distinct execution paths. For the baseline Natural Language Inference evaluation, the records are structured into standard premise and hypothesis pairs. On the other hand, for the proposed contrastive evaluation, the dataset undergoes a specialized, Subject Matter Expert (SME)-validated relational labeling process to restructure the records into targeted training triplets, witht . Within this specific labeling schema, the root delegation goal from the dataset is explicitly designated as the anchor. A semantically equivalent, authorized subtask is mapped as the positive example, while a malicious, scope-expanding adversarial paraphrase is explicitly labeled as the hard-negative example. This deliberate, SME-validated structure is essential to provide the contrastive loss function with the exact and authoritative semantic boundaries it needs to train. Finally, across both formatted paths, the overarching authorization labels are strictly binarized to designate benign instructions as class 0 and adversarial instructions as class 1\.

Once structurally prepared, the formatted data is divided using a stratified train and test split. Exactly 70% of the records are allocated to the training partition, while the remaining 30% are reserved for the evaluation partition. The stratified sampling guarantees that the exact proportional distribution of benign and adversarial instructions is preserved across both subsets.

Before empirical testing begins, the 70% training partition is utilized exclusively to optimize the proposed MiniLM architecture. The model processes the training triplets through its contrastive learning objective to mathematically establish the semantic reference boundaries. Because the baseline NLI model serves as the pre-existing standard, it requires no customized structural optimization and is readied directly for inference.

The actual generation of empirical data occurs during this phase. The held-out thirty percent evaluation partition is grouped into identical testing batches. To guarantee a precise comparative analysis, these batches are processed sequentially. A testing batch is first fed through the baseline Natural Language Inference model to generate the control classifications. Immediately following, the exact same testing batch is processed through the optimized contrastive embedding pipeline to generate the experimental classifications.

As each synchronized batch completes its execution path, the resulting confusion matrix outcomes are automatically captured. The offline system calculates the core performance metrics for each batch, specifically the True Positive Rate, Precision, and F1 Score. These calculated values, alongside the specific batch identifiers and execution path details, are systematically recorded into the structured experiment paper. This finalized evaluation log serves as the definitive empirical dataset required to execute the paired statistical analysis and address the study's research questions. 

## **Ethical Considerations**

This research is conducted strictly as a technical and architectural evaluation and does not involve human subjects. The methodology does not collect, process, or expose personal data, private communications, or individually identifiable information. The primary data source (DelegationBenchv4) is utilized with the explicit permission of the SentinelAgent framework's original author. While the researchers utilized these data samples to train and test the verification models, the dataset was not maliciously manipulated or altered in any manner that would violate the guidelines established by its creators. Specifically, the structural reorganization of the data into relational (anchor, positive, hard-negative) training triplets was performed strictly to facilitate contrastive optimization and was explicitly approved by the original author through direct correspondence.

All empirical experiments will be executed within a highly controlled, offline simulation environment using this static data. To completely eliminate external security risks, no live AI agent deployment, real-time inference pipelines, or active Delegation Authority Services will be subjected to adversarial probing or network disruption. All materials, academic writings, and algorithms incorporated into this framework are rigorously cited and acknowledged to uphold academic integrity. Finally, the researchers commit to absolute transparency throughout the entire evaluation process to prevent analytical bias or the fabrication of results and to guarantee complete methodological reproducibility.

## **Data Analysis**

The data analysis will be conducted in three distinct phases corresponding directly to the three primary research questions.

Table 3\. Data Analysis for each Research Question

| Research Question | Data Source | Type of Analysis | Output |
| :---: | :---: | :---: | :---: |
| **RQ1** | DelegationBench v4 Dataset | Descriptive statistics | Baseline Natural Language Inference Recall, Precision, and F1-Score  |
| **RQ2** | DelegationBenchv4 (Triplet Format)  | Descriptive statistics | Proposed contrastive architecture Recall, Precision, and F1-Score  |
| **RQ3** | Paired Test-Group Results  | One-tailed paired-sample t-test | Statistical significance decision for each performance metric ( α \= 0.05)  |

For Research Question 1, the study will analyze the detection performance of the baseline Natural Language Inference execution path. The baseline model will be evaluated across the synchronized testing batches derived from the held-out 30% evaluation subset to compute the True Positive Rate (Recall), Precision, and F1-Score at the batch level. The study will report the mean and standard deviation of each performance metric across all executed testing batches to establish a foundational benchmark.

For Research Question 2, the study will analyze the performance of the proposed contrastive MiniLM architecture. The evaluation will utilize the identical testing batches derived from the same evaluation partition. The performance of the proposed contrastive architecture will be described using the mean and standard deviation of Recall, Precision, and F1-Score to facilitate a direct descriptive comparison against the baseline configuration.

For Research Question 3, the study will determine whether the proposed contrastive embedding architecture achieves a statistically significant performance improvement over the baseline Natural Language Inference model. This inferential comparison will utilize the paired batch-level metric values. Each testing batch's metrics from the baseline execution path will be directly paired with the corresponding batch's metrics from the proposed contrastive execution path. This structure allows the study to compare the two architectures precisely while controlling for batch-level data variance.

## **Statistical Treatment**

The study will employ a combination of descriptive and inferential statistics to systematically analyze, interpret, and validate the empirical data gathered during the evaluation phase. These statistical techniques ensure that the assessment of the proposed computational solution is mathematically reliable and free from structural bias. 

To address Research Questions 1 and 2 (Statement of the Problem 1 and 2), descriptive statistics will be utilized to summarize the baseline and experimental performance configurations. The study will calculate the True Positive Rate (Recall), Precision, and F1-Score independently across the synchronized test groups. The arithmetic mean will capture the average detection efficacy of each execution path, while the standard deviation will quantify the models' stability when exposed to varying adversarial paraphrases. To compute these metrics objectively, the study relies on the following mathematical formulas derived from the tallied confusion matrix variables: 

Precision \= TPTP \+ FP 

Recall \= TPTP \+ FN

F1-Score=2 x Precision x RecallPrecision \+Recall

To address Research Question 3 (Statement of the Problem 3), a one-tailed paired-sample t-test will be executed to determine whether the proposed contrastive MiniLM architecture achieves a statistically significant performance improvement over the baseline NLI model. The one-tailed paired-sample t-test is the mathematically appropriate treatment because the data structure satisfies the assumption of paired observations; the exact same synchronized test groups are processed sequentially through both independent execution paths. By utilizing paired test groups, the experiment controls for data-level variation and ensures that any measured variance in performance is directly attributable to architectural differences. The one-tailed formulation is deliberately selected because the research hypothesis is strictly directional. 

The study proposes that the integration of contrastive embeddings will systematically increase semantic verification performance. To isolate the effects on different operational demands, the statistical test will be conducted independently for each of the three core performance metrics: 

1. **True Positive Rate (Recall):** To verify a significant increase in the model’s capacity to detect adversarial and scope-expanding delegations.  
2. **Precision:** To verify a significant reduction in false alarms, ensuring system usability.  
3. **F1-Score:** To verify a significant improvement in the overall harmonic balance between threat mitigation and authorization accuracy.

The inferential analysis will test the following directional null hypothesis at a localized level for each metric:

* **H₀:** The proposed contrastive MiniLM architecture does not significantly improve the True Positive Rate (Recall), Precision, and F1-Score compared to the baseline Natural Language Inference model under adversarial paraphrasing and normal conditions.

The level of significance (α) for all three tests is strictly set at 0.05. The operational decision rules for interpreting the statistical output are defined as follows:

* If the calculated p-value is less than or equal to 0.05 (p0.05), the null hypothesis is rejected. This outcome provides definitive mathematical evidence that the proposed contrastive architecture delivers a statistically meaningful improvement in security verification over the baseline.  
* If the calculated p-value is greater than 0.05 (p\>0.05), the null hypothesis is not rejected. This outcome indicates that any observed performance differences may be a result of random variation and demonstrates insufficient evidence to conclude that the proposed computational solution provides a superior security method.

# **APPENDICES**

## **APPENDIX 1:**

## **Overview of DelegationBenchv4 P4 Dataset**

Figure 4\. Benign Entailment Data

Figure 5\. Benign Neutral Data

![][image2]

Figure 6\. Explicit Attack Data

![][image3]

Figure 7\. Adversarial Paraphrase Data

![][image4]  
	

The study uses structured delegation scenarios as the core dataset for analysis. The following schema outlines the textual attributes applied in training and evaluating the verification models:

1. **'Root Delegation Goal'** (String: The original authorized objective assigned to the agent);  
2. **'Subtask Description'** (String: The specific requested action or operation to be evaluated against the root goal); and  
3. **'Label'** (Categorical: Ground-truth target classifying the subtask as 'Benign Entailment', 'Benign Neutral', or 'Malicious Contradiction').

The evaluation utilizes the intent-verification subset of the dataset, consisting of 200 verifiable delegation scenarios across 12 U.S. federal government service domains. To ensure rigorous evaluation and preserve class distribution (60 malicious to 130 benign instances), a 5-fold stratified cross-validation was employed to maintain an approximate 80/20 train-test split across all folds.

## **APPENDIX 2:**

## **Experiment Paper**

This experiment outlines the methodology used to assess the baseline NLI system, alongside the proposed Instruction Decomposition and Contrastive Embedding framework. Evaluation is performed using the DelegationBenchv4 dataset under both standard testing conditions and adversarial paraphrasing scenarios, where professionally worded instructions are used to conceal scope-expanding intent.

The experimental setup is designed to address the study’s three core research questions. The baseline NLI configuration is evaluated to address Research Question 1\. The decomposition-driven framework is evaluated to address Research Question 2\. Finally, the comparative statistical analysis between the baseline and the proposed framework is conducted to address Research Question 3\.

### Procedure: {#procedure:}

1. **Dataset Ingestion:** Load the DelegationBenchv4 dataset consisting of exactly 200 total instances containing root delegation goals and subtask descriptions.  
2. **Lexical Normalization:** Apply text normalization by converting all textual fields to lowercase to eliminate case-related variability and non-semantic bias.  
3. **Stratified Partitioning:** Split the dataset using a deterministic stratified train-test split to ensure an exact 70/30 distribution (140 training samples and 60 testing samples) while strictly preserving the baseline class ratio of benign to malicious instructions.  
4. **Control Path Execution:** Execute the baseline path by formatting the evaluation samples into standard premise-hypothesis pairs and classifying them using the pre-trained cross-encoder NLI model (SentinelAgent P2).  
5. **Relational Labeling:** Prepare the proposed solution path by formatting the training data into specific relational triplets: an anchor (root goal), a positive (authorized subtask), and a hard-negative (adversarial paraphrase).  
6. **Contrastive Representation Optimization:** Train the MiniLM contrastive embedding model directly on the raw text triplets to mathematically establish semantic boundaries.  
7. **Micro-Batch Segmentation:** Divide the 60 held-out test samples into synchronized, equal-sized testing groups (batches) to isolate localized data distributions.  
8. **Parallel Path Evaluation:** Process the synchronized test-groups sequentially through both the standard NLI baseline and the proposed contrastive architecture under normal and adversarial paraphrasing conditions.  
9. **Metric Extraction:** Compute and record the True Positive Rate (Recall), Precision, and F1-Score independently for each individual test-group.  
10. **Data Alignment:** Pair each baseline test-group metric directly with the matching proposed solution test-group metric to ensure side-by-side data comparisons that control for textual variations.  
11. **Inferential Hypothesis Testing:** Apply a one-tailed paired-sample t-test independently for Recall, Precision, and F1-Score across the paired test-group arrays at an alpha level of   \= 0.05.  
12. **Statistical Decision:** Reject the null hypothesis if the calculated p-value satisfies p ≤ 0.05, confirming a significant framework improvement. Do not reject H₀ if p \> 0.05.

### Performance Evaluation Equations: {#performance-evaluation-equations:}

* Precision \= TP / (TP \+ FP)  
* Recall (True Positive Rate) \= TP / (TP \+ FN)  
* F1-Score \= 2 × (Precision × Recall) / (Precision \+ Recall)

Where:

* TP \= Adversarial/scope-expanding delegations correctly identified as unauthorized.  
* TN \= Benign delegations correctly identified as authorized.  
* FP \= Benign delegations incorrectly blocked as unauthorized.  
* FN \= Adversarial/scope-expanding delegations incorrectly permitted as authorized.

Table 4\. Experiment Paper Table

| Verification Architecture | Evaluation Condition | Embedding Space | Recall (TPR) | Precision | F1-Score | Paired t-test Result |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Baseline NLI(SentinelAgent P2) | Normal / Adversarial Paraphrasing | Generic NLI |  |  |  | N/A |
| Proposed Solution(MiniLM) | Normal / Adversarial Paraphrasing | Contrastive |  |  |  | Exact p-value and decision |
