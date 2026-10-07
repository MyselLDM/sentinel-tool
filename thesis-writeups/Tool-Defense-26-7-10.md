-- AS PER 11:48 AM 10/7/2026



# **Semantic Verification of Authorization Alignment in Agent Delegation using Contrastive Embeddings**

# 

A Thesis  

**May 2026**

**TABLE OF CONTENTS**

[**LIST OF TABLES	1**](#heading=)

[**LIST OF FIGURES	1**](#list-of-figures)

[**Chapter 1**](#chapter-1-the-problem-and-its-setting)  
[**THE PROBLEM AND ITS SETTING	1**](#chapter-1-the-problem-and-its-setting)

[Introduction	1](#introduction)

[Theoretical Framework](#theoretical-framework-figure-1.-nli-baseline-for-semantic-verification-of-authorization-alignment-\(patil,-2026\))  
[Figure 1\. NLI Baseline for Semantic Verification of Authorization Alignment (Patil, 2026\)	3](#theoretical-framework-figure-1.-nli-baseline-for-semantic-verification-of-authorization-alignment-\(patil,-2026\))

[Conceptual Framework](#conceptual-framework-figure-2.-conceptual-framework)  
[Figure 2\. Conceptual Framework	5](#conceptual-framework-figure-2.-conceptual-framework)

[Statement of the Problem	8](#statement-of-the-problem)

[Significance of the Study	11](#significance-of-the-study)

[Definition of Terms	14](#definition-of-terms)

[**Chapter 2**](#chapter-2-review-of-literature-and-studies)  
[**REVIEW OF LITERATURE AND STUDIES	18**](#chapter-2-review-of-literature-and-studies)

[Agentic AI Delegation and the Semantic Security Gap	18](#agentic-ai-delegation-and-the-semantic-security-gap)

[Natural Language Inference and its Failure under Adversarial Paraphrasing	23](#natural-language-inference-and-its-failure-under-adversarial-paraphrasing)

[The Heuristic Flaw: Surface Patterns over Logical Understanding	24](#the-heuristic-flaw:-surface-patterns-over-logical-understanding)

[The Mechanics of Adversarial Paraphrasing	25](#the-mechanics-of-adversarial-paraphrasing)

[Systemic Breakdown: Output-Mode Collapse	27](#systemic-breakdown:-output-mode-collapse)

[Compositional Blindness	28](#compositional-blindness)

[Mitigating Shortcut Learning via Causal Reasoning	28](#mitigating-shortcut-learning-via-causal-reasoning)

[Contrastive Learning for Authorization-Aware Sentence Embeddings	30](#contrastive-learning-for-authorization-aware-sentence-embeddings)

[Contrastive Learning and MiniLM	33](#contrastive-learning-and-minilm)

[Algorithmic Task-to-Scope Matching and Boundary Formalization	35](#algorithmic-task-to-scope-matching-and-boundary-formalization)

[Threat Landscape, Behavioral Vulnerabilities, and Observability Metrics	37](#threat-landscape,-behavioral-vulnerabilities,-and-observability-metrics)

[Synthesis of the Study	38](#synthesis-of-the-study)

[**Chapter 3**](#chapter-3-methodology)  
[**METHODOLOGY	42**](#chapter-3-methodology)

[Research Design	42](#research-design)

[Sources of Data	43](#sources-of-data)

[Sampling Data	45](#sampling-data)

[System Architecture	49](#system-architecture)

[Research Instrument	53](#research-instrument)

[Data Generation/Gathering Procedure	56](#data-generation/gathering-procedure)

[Ethical Considerations	58](#ethical-considerations)

[Data Analysis	60](#data-analysis)

[Statistical Treatment	61](#statistical-treatment)

[References	68](#references)

[APPENDIX 1:	73](#appendix-1:)

[Overview of DelegationBenchv4 P2 Dataset	73](#overview-of-delegationbenchv4-p2-dataset)

[APPENDIX 2:	76](#appendix-2:)

[Experiment Paper	76](#experiment-paper)

[APPENDIX 3:](#appendix-3:-mockup)  
[Mockup	82](#appendix-3:-mockup)

# 

# **LIST OF TABLES**

| Number | Title | Page |
| ----- | :---: | ----- |
| 1 | **Comparative Analysis of Delegation Frameworks** | 29 |
| 2 | **Key-Study Summary Table: NLI Failure under Adversarial Paraphrasing** | 35 |
| 3 | **Data Analysis for each Research Question** | 65 |
| 4 | **Fold Level Experiment Log** | 82 |
| 5 | **Experiment Summary & Paired t‑Test Results**  | 84 |

# **LIST OF FIGURES** {#list-of-figures}

| Number | Title | Page |
| :---: | :---: | :---: |
| 1 | **Theoretical Framework** | 5 |
| 2 | **Conceptual Framework** | 9 |
| 3 | **System Architecture** | 54 |
| 4 | **Benign Entailment Data** | 76 |
| 5 | **Benign Neutral Data** | 76 |
| 6 | **Explicit Attack Data** | 77 |
| 7 | **Adversarial Paraphrase Data** | 77 |
| 8 | **Assistant View Chatbox** | 85 |
| 9 | **Task Inspector**  | 85 |
| 10 | **Admin Dashboard Overview** | 86 |
| 11 | **API Key Management** | 86 |
| 12 | **System Logs**  | 86 |
| 13 | **Model Configuration**  | 87 |
| 14 | **Developer Docs**  | 88 |
| 15 | **Product Homepage**  | 88 |
| 16 | **Authentication Portal**  | 89 |

# **Chapter 1** **THE PROBLEM AND ITS SETTING** {#chapter-1-the-problem-and-its-setting}

## **Introduction** {#introduction}

	The shift from human-operated software to autonomous AI agents represents one of the biggest architectural transitions in computing since the adoption of the internet. This gave birth to modern agentic systems that can interpret natural language commands, reason about objectives, and independently invoke tools across multi-step workflows, which unlocks transformative productivity but fundamentally alters the security assumptions under which identity and access control systems were designed. The consequences introduced in the  rapid deployment of autonomous AI agents in critical sectors are unprecedented security challenges. Traditional chatbots do not possess this behavior. Modern AI agents have the power to execute code and make automatic, sometimes unsupervised decisions across multi-step workflows. Because these systems are nondeterministic and operate asynchronously, standard identity infrastructure designed for human users faces new challenges from non-human agentic operations (Otsuka et al., 2026). Systems now require verifiable mechanisms for delegated authority to restrict permissions and maintain clear chains of accountability (South et al., 2025). This is further complicated by authorization propagation, an architectural problem where security rules degrade as non-human principals autonomously delegate tasks across changing security boundaries (Tallam, 2026). As a result, current systems lack the ability to securely track and verify exactly what an agent is doing on behalf of a human principal, creating a broad vulnerability known as the delegation observability gap (Patil, 2026).

	Within this delegation observability gap exists a specific, critical flaw that this paper addresses: the semantic security gap. This refers to the fundamental mismatch where current agentic systems rely on Natural Language Inference (NLI) models to evaluate generic linguistic similarity rather than enforcing strict security boundaries. When an agent receives a delegation request, existing security frameworks typically use NLI to determine whether the requested subtask entails the originally authorized objective (Patil, 2026). The model sees two semantically similar statements and calls it entailment,  meaning it treats them as having the same definition, even when the second formulation is intentionally vague enough to justify broader access (Ou et al., 2026). In SentinelAgent, a delegation framework, the NLI based intent verification component degrades to only a 13% true positive detection rate when subjected to sophisticated paraphrasing attacks (Patil, 2026). This means that 87% of malicious delegation attempts disguised through semantic manipulation successfully evade detection. Siu et al. (2026) recognized this as a fundamental limitation, noting that pattern based detection cannot distinguish context-dependent authorization because it lacks causal attribution of which inputs actually caused agent actions. Attackers can actively exploit this semantic flexibility to slip scope expanding instructions past security filters, with Cheng and Sadasivan (2025) demonstrating an average true positive rate reduction of 87.88%  across eight different detector categories. This vulnerability is harnessed by users with malicious intent, known as the action “Adversarial Paraphrasing”.

## **Theoretical Framework** Figure 1\. NLI Baseline for Semantic Verification of Authorization Alignment (Patil, 2026\) {#theoretical-framework-figure-1.-nli-baseline-for-semantic-verification-of-authorization-alignment-(patil,-2026)}

The P2 Intent Verification Framework for SentinelAgent operates as a sequential pipeline that begins by receiving the delegation intent as its primary input. This initial input is immediately routed through a keyword safety filter, which is specifically designed to check for malicious action indicators before initiating any deeper semantic analysis. By isolating explicit threat keywords early in the workflow, the framework establishes a preliminary security boundary.

Following the initial keyword filter, the system applies contextual framing to organize the input into a formal premise and hypothesis construction. This logically structured text then undergoes a preprocessing phase, which involves necessary text tokenization and formatting. Once the text is properly formatted, the framework executes feature extraction by utilizing transformer self-attention embeddings to capture the deep semantic relationships within the instruction. These extracted contextual features are subsequently passed into a cross-encoder classification head for rigorous evaluation.

Before finalizing the authorization verdict, the output from the cross-encoder is processed by a benign indicator checker. This critical component checks for safe context exceptions, acting as a safeguard to ensure that legitimate, authorized delegation instructions are not incorrectly blocked by the preceding layers. In summary, the framework synthesizes these checks into a final intent prediction, yielding a definitive binary outcome where the delegation request is either approved or rejected

## **Conceptual Framework** Figure 2\. Conceptual Framework {#conceptual-framework-figure-2.-conceptual-framework}

![][image1]

	Figure 2 presents the conceptual framework of the study, which follows an Independent-Dependent Variable model. It shows how delegation pairs are verified by two competing approaches, evaluated under identical conditions, and compared statistically.

The input to the framework is the delegation pair, which consists of a root delegation goal describing the service an agent is authorized to perform and a subtask describing the action the agent is about to carry out. These pairs are drawn from a purpose-built corpus of 584 records covering twelve U.S. federal government service goals. The corpus was developed from the twelve-goal catalog and hand-authored scenarios of the SentinelAgent P2 work (Patil, 2026\) and was extended with scenarios verified by an expert. Each record is labeled as a benign entailment, a benign neutral operation, or a malicious contradiction of the delegated authority. Malicious records are further divided into explicit violations, in which the harmful action is stated openly, and purpose violations, in which the subtask resembles a legitimate operation but serves a purpose the goal does not authorize.

The independent variable is the verification architecture. The baseline represents the NLI-based approach used in SentinelAgent's P2 component, which has been reported to fail when malicious instructions are reworded to resemble legitimate ones (Patil, 2026). In this path, each pair is lowercased and formatted into a premise stating the authorized goal and a hypothesis stating the subtask. A pre-trained MiniLM cross-encoder then assigns probabilities to the contradiction, entailment, and neutral categories, and the contradiction probability is used as the violation score. The same cross-encoder, fine-tuned following the P2 procedure, is reported as a secondary reference.

The proposed path applies contrastive metric learning. The labeled records are restructured into triplets in which the root goal serves as the anchor, a benign subtask serves as the positive, and a malicious subtask serves as the negative. Preference is given to hard negatives, which differ from a benign subtask by only a qualifier or a role. A MiniLM sentence transformer is trained on these triplets using a triplet loss based on cosine distance, which pulls authorized pairs together and pushes unauthorized pairs apart in embedding space. The cosine similarity between a goal and its subtask then serves as the verification score.

Both scores are converted into binary verdicts using a decision threshold. For each model, the threshold is selected by sweeping candidate values and choosing the one that maximizes the F1-score of the malicious class. To keep the comparison fair, both approaches are trained under the same training budget and tested on the same five cross-validation folds, which are grouped by root goal so that test goals are never seen during training and stratified by attack family.

The dependent variables measure detection performance, with malicious subtasks treated as the positive class. Recall measures the proportion of malicious subtasks that are correctly detected and is also reported separately for explicit and purpose violations. Precision measures the proportion of flagged subtasks that are genuinely malicious, while the F1-score combines both into a single balanced measure. Finally, a one-tailed paired t-test at a significance level of 0.05 is applied to the fold-level Recall, Precision, and F1-score. The test is one-tailed because the hypothesis is directional, and it is paired because both approaches are evaluated on the same folds.

## **[Statement of the Problem](https://docs.google.com/document/d/1usuvsI_22lph_aWcAf0GiMV1DBe3CN7vM1F0ZvsEoFw/edit?tab=t.brbfwsbm9lib#bookmark=id.6z9o7o4v1y6b)** {#statement-of-the-problem}

	This study aims to verify authorization alignment in agent delegation by evaluating a contrastive embedding model against a standard Natural Language Inference (NLI) baseline. Specifically, a MiniLM sentence transformer is fine‑tuned with a contrastive learning objective on delegation‑specific (anchor, positive, hard‑negative) triples to distinguish scope‑preserving paraphrases from scope‑expanding adversarial paraphrases, and the study determines whether there is a significant difference between the baseline NLI model and the proposed contrastive model in terms of Recall, Precision, and F1‑Score. Specifically, this study seeks to answer the following questions:

1. What is the detection performance of the proposed contrastive embedding model under adversarial paraphrasing and normal conditions, in terms of:  
   1. True Positive Rate (Recall);  
   2. Precision;  
   3. F1‑Score?  
2. Is there a significant difference in the performance of the baseline NLI‑based model and the proposed contrastive embedding model under adversarial paraphrasing and normal conditions, in terms of:  
   1. True Positive Rate (Recall);  
   2. Precision;  
   3. F1‑Score?

**Hypotheses**

The study will test the following hypotheses:

* **H₀:** The proposed contrastive embedding model **does** **not** improve the true positive rate compared to SentinelAgent's NLI‑based model under adversarial paraphrasing and normal conditions.  
* **H₁:** The proposed contrastive embedding model **does** improve the true positive rate compared to SentinelAgent's NLI‑based model under adversarial paraphrasing and normal conditions.

**Scope and Limitation of the Study**

	This study is a technical proof-of-concept that examines whether a contrastive embedding model can verify semantic intent in AI agent delegation more reliably than the NLI-based verifier in SentinelAgent's P2 component, which was reported to fall to a 13% true positive rate under adversarial paraphrasing (Patil, 2026). The study is limited to this probabilistic intent verification component. The deterministic layers of SentinelAgent, namely P1 and P3 to P7, are not re-implemented or evaluated and are taken as given from the original framework.

The study compares two MiniLM-based verifiers. The baseline is a pre-trained MiniLM NLI cross-encoder, with a version fine-tuned following the P2 procedure reported as a secondary reference. The proposed model is a MiniLM sentence transformer fine-tuned with a cosine-based triplet loss. MiniLM was chosen because it is small and fast at inference and because it matches the baseline architecture, so that differences in results can be attributed to the verification approach rather than to model size.

The data is a purpose-built corpus of 584 records across twelve root delegation goals in U.S. federal government services, consisting of 220 malicious and 364 benign records, the latter divided into 251 entailment and 113 neutral subtasks. The corpus adopts the twelve-goal catalog and hand-authored scenarios of the DelegationBench v4 intent verification subset (Patil, 2026). Of the 190 published scenarios available to the study, 164 were retained as seed records. The full DelegationBench v4 benchmark is therefore not used as the evaluation set; instead, its intent-verification (P2) scenarios are retained as an external testing batch that anchors the comparison to the published baseline.

The malicious records cover explicit violations and purpose violations across five harm categories: data exfiltration, bias injection, privilege escalation, surveillance, and corruption. Other attack vectors, such as prompt injection, data poisoning, model extraction, and multi-turn adaptive attacks, are not covered in this study.

The models are evaluated using five-fold cross-validation grouped by root goal and stratified by attack family, with all fine-tuned models trained under the same budget. Recall serves as the primary metric and is reported both overall and per violation type, while Precision and F1-score serve as supporting metrics. Accuracy is not used because the corpus is class-imbalanced, so a model that always predicts benign would appear accurate while achieving zero recall. Statistical significance is tested using a one-tailed paired t-test at a significance level of 0.05 on the fold-level results.

All evaluation is conducted offline on pre-labeled delegation pairs. The study also developed a prototype verification service that scores a goal and subtask with both models, but it serves only as a demonstration and is not part of the experimental comparison. Deployment concerns such as integration with a live multi-agent system, inference latency, and throughput are therefore outside the scope of the study.

Several limitations bound the interpretation of this study. The corpus is small and narrow, covering only twelve goals in English-language federal government services, so the conclusions may not generalize to other domains or languages. The paired t-test relies on only five fold-level observations, which limits its statistical power. Because the decision threshold is selected on the same fold that is used for testing, the resulting operating points will be optimistic rather than independently validated, and the cosine similarity produced by the contrastive model is a distance score rather than a calibrated probability. Finally, each subtask is verified independently against its root goal, so violations that emerge only across a sequence of subtasks cannot be detected by the approach.

## **Significance of the Study** {#significance-of-the-study}

This study advances the field of computer science by addressing a measurable, published failure in multi-agent AI security: the collapse of intent verification under adversarial paraphrasing. SentinelAgent achieves only a 13% true positive rate when an adversary subtly rewords instructions to expand scope while preserving surface meaning. The present work directly targets this specific, author-identified weakness with a novel contrastive embedding-based approach that learns the distinction between semantic similarity and authorization-preserving equivalence. In doing so, it contributes both a methodological framework and a community resource, each of which is a legitimate computer science artefact.

The findings and outputs of this research may be of value to the following:

**The Field of Computer Science.** The study provides three concrete contributions. First, it proposes a contrastive embedding model for authorization-aware semantic alignment, connecting contrastive representation learning with delegation intent verification. Second, it establishes a methodology for organizing the existing DelegationBench v4 dataset into specific relational training triplets. By mapping the data into an anchor, a positive subtask, and a hard-negative adversarial paraphrase, the study provides a structured way to fine-tune contrastive models for security boundaries. Third, it establishes a reproducible evaluation pipeline that compares the contrastive model against the published SentinelAgent P2 baseline, ensuring a direct comparison with the documented 13% true positive rate. Together, these artefacts deliver a complete, measurable solution to a well‑defined semantic security gap, meeting the standard for a systems‑building contribution in computer science.

**AI security and delegation researchers.** Researchers investigating multi-agent delegation and intent preservation gain a reusable framework to evaluate whether a semantic model actually preserves authorization boundaries. The methodology can be applied to other domains where natural language permissions must be verified under adversarial conditions, such as access control, legal document processing, or healthcare consent verification.

**Organizations and Government Agencies.** The study utilizes a dataset spanning federal domains. The proposed framework directly benefits government and enterprise institutions by offering a reliable mechanism to enforce strict data privacy and prevent unauthorized data exfiltration within multi-agent workflows. This ensures compliance with stringent operational standards even when tasks are delegated autonomously.

	**Developers of agentic AI systems.** Practitioners building autonomous systems acquire a practical alternative to general-purpose Natural Language Inference models formatted as an easily integrable library. The proposed contrastive model is designed as a plug-and-play, drop-in replacement for SentinelAgent's P2 that targets higher recall under adversarial paraphrasing while keeping false positives low, directly addressing the risk of scope-expansion attacks in production deployments. Furthermore, by utilizing a lightweight all-MiniLM architecture, the study provides a highly scalable, memory-efficient security solution that can be deployed without requiring massive computational overhead.

**End-Users and the General Public.** As autonomous AI agents are increasingly integrated into critical, high-stakes systems, establishing public trust is essential. By providing a measurable layer of security that prevents autonomous systems from silently overstepping their authorized boundaries, this study contributes directly to the safe and transparent deployment of AI technologies that handle sensitive user data.

**Future Researchers.** The study establishes an empirical baseline and a structured dataset labeling methodology that future work can extend. Researchers can build on these findings by exploring larger transformer architectures, multilingual delegation instructions, or integration with deterministic enforcement layers. The contrastive training approach can also be adapted to other natural language processing tasks where generic semantic equivalence is insufficient and strict authorization alignment is required. 

## **Definition of Terms** {#definition-of-terms}

**Adversarial Paraphrasing.** This refers to the deliberate linguistic manipulation of a delegation instruction in which the surface‑level wording is altered to remain semantically similar while the operational scope is stealthily expanded, thereby evading intent verification systems (Cheng & Sadasivan, 2025; Patil, 2026). In this study, it constitutes the primary attack class evaluated.

**Agent Delegation.** This is the process by which an autonomous AI agent transfers a task or subtask to another system component while acting on behalf of a human principal (South et al., 2025). In the context of this work, it is examined specifically at the point of verification.

**Anchor.** In the contrastive learning framework, this is the original authorized delegation goal that serves as the reference point against which other instructions are compared. In this study, the anchor is the root delegation goal extracted from the DelegationBench v4 dataset.

**Authorization Alignment.** This denotes the condition in which a delegated instruction strictly preserves the boundaries and constraints of the original authorization. Operationally, a delegation is aligned if its embedding vector lies within a thresholded cosine similarity distance from the anchor embedding in the contrastive space.

**Authorization Drift.** This term refers to a contextual security failure where an autonomous agent gradually diverges from its initial authorized objective or operates with broader authority than intended across delegation chains, without any external adversarial prompting (Siu et al., 2025; Tallam, 2026).

**Authorization Propagation.** This is an architectural vulnerability in multi‑agent systems where access‑control invariants degrade as non‑human principals autonomously delegate tasks across changing security boundaries, potentially leading to privilege escalation or scope accumulation (Tallam, 2026). It is one of the systemic weaknesses that make the semantic security gap particularly dangerous.

**Compositional Blindness.** This concept describes a theoretical vulnerability where sentence encoders fail to adhere to the principles of semantic compositionality, and instead take shortcuts by focusing on misleading surface clues (like words that look very similar) to decide whether two things mean roughly the same thing  (Chanchani & Huang, 2023).

**Contrastive Embeddings.** These refer to vector representations of text generated through a mathematical method that enforces boundary conditions by utilizing hard negative samples (Chanchani & Huang, 2023; Chuang et al., 2022). This technique forces models to differentiate between inputs that share high lexical overlap but diverge in core meaning.

**Delegation Observability Gap.** This is a broad system vulnerability defined as the inability to securely track, log, and verify exactly what an autonomous agent is executing on behalf of a human principal (Patil, 2026). It forms the larger context within which the present study addresses the narrower semantic security gap.

**DelegationBench v4.** This is the evaluation benchmark released with the SentinelAgent framework (Patil, 2026). It contains 516 delegation scenarios spanning ten attack categories and thirteen federal domains. In this study, the intent‑verification (P2‑relevant) subset of DelegationBench v4 is used as the sole evaluation dataset.

**Hard Negative.** In the contrastive learning framework, this is a scope‑expanding adversarial paraphrase that is explicitly used during training to teach the model which instruction variants are unauthorized. The model is penalized when the hard negative embedding lies too close to the anchor.

**Intent Verification (P2).** This property, formally defined as intent entailment preservation in the SentinelAgent framework, is a probabilistic security mechanism ensuring that the core semantic meaning of a human principal's original intent is securely maintained and verified across every agent-to-agent handoff (Patil, 2026).

**MiniLM.** This is a lightweight sentence‑transformer model (all‑MiniLM‑L6‑v2) used in the proposed architecture to produce contextualized embeddings. In the proposed pipeline, it verifies authorization alignment through a contrastive learning objective.

**Natural Language Inference (NLI).** This is a classification model traditionally utilized to evaluate generic linguistic similarity and determine whether a requested subtask semantically entails the originally authorized objective (Patil, 2026). In this study, NLI serves as the baseline intent‑verification method.

**Positive.** In the contrastive learning framework, this is a benign, scope‑preserving paraphrase of the anchor that represents an instruction the model should treat as authorized. The model is trained to bring the positive embedding close to the anchor.

**Precision.** This evaluates the proportion of flagged delegations that are genuinely unauthorized. Operationally, it measures the ability of the verification model to ensure legitimate delegations are not incorrectly blocked.

**Recall (True Positive Rate).** This measures the proportion of actual malicious or scope‑expanding delegations that are correctly identified as unauthorized. It serves as the primary evaluation metric because the documented security gap is defined by missed adversarial paraphrases.

**F1‑Score.** This is the harmonic mean of precision and recall, providing a single balanced metric that accounts for both threat detection and false positive avoidance. It is computed to summarize overall detection performance.

**Semantic Security Gap.** This concept describes a fundamental mismatch where agentic systems rely on generic linguistic entailment rather than strict parameter‑level enforcement which causes semantic filters to fail under subtle scope manipulation (Patil, 2026). It is the specific gap that the present study targets by replacing NLI‑based intent verification with contrastive embedding alignment.

**SentinelAgent.** This is a state‑of‑the‑art multi‑agent delegation framework that enforces seven formal properties through a Delegation Authority Service (Patil, 2026). Its probabilistic intent verification component (P2) uses an NLI model that collapses to a 13 % true positive rate under adversarial paraphrasing. The present study accepts SentinelAgent’s deterministic layers (P1, P3-P7) as proven baselines and replaces only the P2 component.

# **Chapter 2** **REVIEW OF LITERATURE AND STUDIES** {#chapter-2-review-of-literature-and-studies}

This chapter situates the study within agentic delegation security, natural language inference, compositional semantics, and contrastive representation learning. It is organized thematically and examines the semantic security gap in agent delegation, the vulnerability of NLI-based intent verification to adversarial paraphrasing and contrastive embeddings as a unified defense. The review is organized thematically, it covers semantic security gaps, NLI vulnerabilities, contrastive learning, evaluation benchmarks, and the research gap addressed by the study.

## **Agentic AI Delegation and the Semantic Security Gap** {#agentic-ai-delegation-and-the-semantic-security-gap}

The delegation of authority to AI agents has rapidly become a practical necessity, but the security community has been forced to acknowledge that traditional identity‑and‑access management architectures were not designed for non‑human, autonomous principals. South et al. (2025) formalised this mismatch and argued that purely identity‑based delegation cannot reliably prevent an agent from misinterpreting a reworded mandate, and they called for a new class of *authenticated delegation* protocols that make authorisation explicit and machine‑verifiable. The same authors extended this argument into a position paper, asserting that AI agents need authenticated delegation as a first‑class security primitive (South et al., 2025, *Position*). These works clarified the problem, but they did not yet provide a complete enforcement pipeline.

The moment an AI agent is allowed to delegate work to another agent, a crack opens that no cryptographic signature can seal. The instruction "Process disability benefits for veteran" travels from the human to a first agent, who rephrases it for a second agent as "Retrieve all records relevant to the veteran's care history." The words have shifted, and with them the scope of what is permitted. A standard permission check sees a valid token and a permitted tool; it does not see the semantic drift that has quietly widened the authorization boundary. That blind spot is the subject of this section, the gap between what deterministic delegation frameworks can prove and what they can actually prevent, and the specific, recurring failure of Natural Language Inference as the layer meant to close that gap.

The idea that autonomous agents need authenticated delegation is no longer contested. South et al. (2025) laid the groundwork with a token‑based framework that cryptographically binds a user identity, an agent identity, and a declared scope. Their position paper argued that AI agents require authenticated delegation as a first‑class security primitive, and their protocol answered the question of *who delegated what to whom*. Yet the same authors acknowledged that translating a natural‑language scope into something machine‑enforceable remained unsolved. The delegation token can carry the words "for internal use only," but nothing in the token ensures that a downstream agent's rephrasing of the task will respect those words. That particular failure, the gap between a signed scope and a semantically faithful execution, is the crack through which adversarial paraphrasing slips.

Otsuka et al. (2026) took the diagnosis deeper. Surveying the standards landscape for AI agent identity, they identified a category error at the heart of current agent security: the conflation of cryptographic correctness with semantic correctness. A system can prove that an agent is authorized to call a particular database endpoint; it cannot prove that the agent is calling it for the right reason. A signed delegation token is evidence that permission was granted, not evidence that the permission was used as intended. That distinction, Otsuka and colleagues argued, is not a nuance, it is the difference between a secure system and one that merely keeps clean logs while allowing whatever actions the language model happens to generate.

Gaikwad (2025) systematised this problem across the broader agent security landscape. In what he terms the *determinism gap*, autonomous agents map permissions onto intermediate representations that are formed through language‑model inference and are therefore inherently unstable. The mapping from a permission to the action it permits can be altered by a slight change in phrasing, a longer context window, or an adversarial prompt, none of which a classical IAM mechanism was designed to notice. His Agentic Trust Fabric taxonomy positions semantic intent verification as the weakest link in the chain, a link that deterministic policy engines were never built to reinforce.

Tallam (2026) explored how this weakness scales across delegation chains. Even with perfect prompt‑injection defences, he argued, multi‑agent systems face an architectural vulnerability he calls *authorization propagation*: as non‑human principals delegate tasks across changing security boundaries, access‑control invariants degrade. Authority can accumulate illegitimately through a chain of delegations, not because any single step violates a rule, but because each step slightly reshapes the scope in a way the system cannot detect. Tallam also introduced the concept of *aggregation inference*, where an agent synthesises data from multiple individually authorised sources to produce a result that exceeds the user's actual permitted scope. These are not implementation bugs; they are consequences of a design that treats language as a transparent carrier of permission, when language is inherently ambiguous and reinterpretable at every hop.

Siu et al. (2026) contributed a crucial refinement to the threat model by distinguishing between two mechanisms of semantic violation. *Task drift* occurs when an agent autonomously diverges from its authorised objective without any external adversarial prompting, the model simply reinterprets the task in a broader way. *Indirect prompt injection* requires both an unauthenticated source and an action that is misaligned with the original intent. A verification system that only looks for injection attacks will miss task drift; a system that only enforces deterministic tool‑level rules will miss both. What is needed is a mechanism that checks whether the meaning of an instruction still resides within the authorization boundary, regardless of how the deviation occurred.

Patil (2026) put these concerns into practice with SentinelAgent, the closest the field has come to a complete delegation‑verification pipeline. SentinelAgent implements seven formal properties, six deterministic, one probabilistic, enforced by a non‑LLM Delegation Authority Service. Properties P1 and P3-P7 provide authority narrowing, policy preservation, forensic reconstructibility, cascade containment, scope‑action conformance, and output‑schema conformance. These layers achieve a 100 % true‑positive rate on rule‑based violations: an agent cannot call an unauthorised endpoint, cannot exceed a time budget, cannot bypass an explicit deny rule. But the seventh property, P2 (Intent Entailment Preservation), is probabilistic. It uses a fine‑tuned Natural Language Inference model to determine whether a subtask description entails the original authorised goal. On clean, in‑domain delegations, the NLI model reaches approximately 88 % true‑positive rate after fine‑tuning. Under adversarial paraphrasing, where an instruction is subtly reworded to expand scope while preserving surface plausibility, that true‑positive rate collapses to roughly 13 %. The deterministic layers, for all their rigour, cannot compensate for this failure because they check *what tool* is called, not *whether the instruction to call it* still matches the human’s intent. The gap that reopens at P2 is precisely the semantic security gap that the present study addresses.

ServiceNow’s Now Assist platform was found to contain a critical second‑order prompt injection vulnerability (CVE‑2025‑12420, CVSS 9.3), where a lower‑privilege agent could be manipulated through semantically crafted language to recruit a higher‑privilege agent into performing unauthorised data exfiltration and privilege escalation (Otto, 2026). Microsoft 365 Copilot was assigned CVE‑2025‑32711 after researchers demonstrated a zero‑click command injection that allowed unauthorised information disclosure through hidden prompts embedded in otherwise legitimate‑looking documents. Beyond the headline CVEs, Solozobov (2026) documented a pattern of destructive agent actions that passed deterministic permission checks while violating their semantic scope: a Replit coding agent dropped a production database

 In July 2025, a Cursor agent issued a destructive rm \-rf \~ command during an active development session in August 2025, and in February 2026 a Claude Code agent wiped production infrastructure, databases, and over two years of snapshots via a Terraform destroy command. In every case, the agent was authorised; in every case, the authorization was semantically misaligned with the action that was executed. Solozobov called this the *container fallacy*: the false assumption that the presence of a signed token or an audit log entry is equivalent to audit sufficiency. A token can verify that a call occurred; it cannot answer the governance question of whether a destructive mutation was genuinely authorised under the semantic constraints of the original delegation.

Taken together, these works trace a clear and worsening trajectory. South et al. established the need for authenticated delegation but left semantic enforcement as future work. Tallam, Otsuka, and Gaikwad exposed the structural and categorical weaknesses of relying on deterministic layers alone. Siu et al. provided the threat taxonomy that distinguishes drift from injection and shows why both evade current defences. Patil operationalised an important recent framework and, in doing so, produced the clearest measurement of the semantic gap: 13 % true‑positive rate under adversarial paraphrasing. The real‑world incidents confirm that the gap is actively exploited and that the consequences include financial loss, data exfiltration, and infrastructure destruction. What remains missing, and what the rest of this review builds toward, is a verification layer that can distinguish between a safe rewording of a delegation and a dangerous one, not by checking tool names or output types, but by learning the difference between instructions that preserve an authorization boundary and instructions that silently cross it.

Table 1\. Comparative Analysis of Delegation Frameworks

| Framework | Semantic intent verification | Deterministic enforcement | Handles adversarial paraphrasing |
| :---: | :---: | :---: | :---: |
| **South et al. (2025) \- Authenticated Delegation** | No \- conceptual only | No, protocol layer | No |
| **SentinelAgent (Patil, 2026\)** | NLI‑based (P2) \- 13 % TPR under attack | Yes (P1, P3-P7) \- 100 % TPR | No \- P2 collapses |
| **Proposed study** | Contrastive embeddings | Not built (accepts P1, P3-P7) | Yes (targeted) |

## **Natural Language Inference and its Failure under Adversarial Paraphrasing** {#natural-language-inference-and-its-failure-under-adversarial-paraphrasing}

Natural Language Inference (NLI) has become the default mechanism for semantic verification in agent delegation systems. Given a premise, the authorized objective, and a hypothesis, the subtask an agent intends to execute, an NLI model classifies the relationship as entailment, contradiction, or neutral. The appeal of this approach is clear: it promises a single, general-purpose judgment of semantic fit, exactly what a delegation pipeline needs at the point where a rephrased instruction must be checked against an original authorization. However, a growing body of research has exposed fundamental weaknesses in NLI that make it unsuitable for security-critical verification, particularly when the input is deliberately crafted to preserve surface meaning while altering the underlying operational scope. This section examines the heuristic foundations of NLI, the mechanics of adversarial paraphrasing, the systemic breakdowns that occur in automated pipelines, and emerging causal frameworks that attempt to mitigate these vulnerabilities. Together, the evidence demonstrates that NLI, in its current form, cannot reliably distinguish between a safe rephrasing of a delegation and a dangerous one.

## **The Heuristic Flaw: Surface Patterns over Logical Understanding** {#the-heuristic-flaw:-surface-patterns-over-logical-understanding}

Despite the formal framing of NLI as a reasoning task, models trained on standard datasets frequently rely on shallow, fallible syntactic heuristics rather than performing genuine semantic analysis. A primary limitation is the reliance on shortcut learning (Du et al., 2023). McCoy, Pavlick, and Linzen (2019) provided the foundational diagnosis of this behavior, demonstrating that NLI models adopt a lexical overlap heuristic: when a hypothesis shares a high proportion of content words with the premise, the model strongly defaults to an entailment prediction, even when the logical relationship between the two sentences is actually contradiction. This "right for the wrong reasons" phenomenon means the model latches onto statistical regularities in the training data rather than performing deep logical deduction.

For a delegation verification system, the lexical overlap heuristic is devastating. An adversary can subtly alter the operational meaning of a prompt while deliberately retaining most of the original vocabulary. For example, the instruction "Retrieve the latest financial statement for the account" and its adversarial variant "Retrieve the financial statements for the account" share nearly every content word. The NLI model, detecting the high overlap, predicts entailment. The removal of the temporal qualifier "latest" and the pluralization of "statement" to "statements", changes that silently broaden access from a single report to an entire account history, are invisible to a model that has learned to equate word overlap with semantic equivalence. Jurafsky and Martin (2025) situate this failure within a broader pattern in contemporary NLP: models optimize for surface-level distributional similarity rather than the compositional, logical structure of language that is required for tasks like authorization verification.

## **The Mechanics of Adversarial Paraphrasing** {#the-mechanics-of-adversarial-paraphrasing}

The vulnerability of NLI to surface-level manipulation is not a passive weakness; it is an active attack surface that adversaries can exploit with minimal effort. Cheng et al. (2025) formalized *Adversarial Paraphrasing* as a universal, training-free attack framework. By subtly rewording text to maintain surface-level plausibility, an attacker can "humanize" AI-generated content or malicious payloads, causing robust semantic detectors to misclassify the input as benign. The attack is universal in the sense that it transfers across detector architectures and domains: the same paraphrasing strategy defeats models trained for AI-text detection, factuality verification, and semantic similarity assessment. Crucially, the attack does not require access to the target model's parameters or training data; it operates in a black-box setting, making it practical for real-world adversaries. The average true-positive rate reduction across eight detector categories was approximately 87.88%, a figure that closely mirrors the 87% evasion rate observed in SentinelAgent's P2 under adversarial paraphrasing (Patil, 2026). The attack succeeds because the paraphrasing model is trained to produce fluent, natural-sounding text that preserves the essential content of the original while altering the surface-level features that detectors rely on. This is exactly the scenario in delegation verification: an instruction that is semantically equivalent to an authorized command, but phrased differently, can cause an agent to take actions that the security filter misses.

The effectiveness of adversarial paraphrasing extends beyond simple text classification into more complex verification pipelines. Ou et al. (2026) introduced DECEIVE-AFC, a framework that systematically disrupts search-enabled LLM-based fact-checking systems through adversarial claims. The attack works by preserving the factual intent of the original claim, what the claim asserts about the world, while altering its linguistic properties to evade retrieval and reasoning mechanisms. The adversarial claims cause the fact-checking system to retrieve irrelevant evidence, misinterpret the claim's relationship to that evidence, and ultimately produce incorrect verdicts. The significance of this work for delegation verification is direct: the same pipeline structure, retrieve context, apply NLI, produce a binary decision, characterizes intent verification in multi-agent systems. If an adversarial paraphrase can cause a fact-checking system to accept a false claim as true, then an adversarial paraphrase can cause a delegation verifier to accept a scope-expanded instruction as authorized. The mechanism is identical: the model processes the surface form, finds it similar to known benign examples, and ignores the subtle semantic shift that changes the operational meaning.

Targeted paraphrasing methods further expose the brittleness of semantic similarity metrics. Kassem and Saad (2024) developed a technique for uncovering critical edge cases in detection systems by generating paraphrases with minimal distribution distortion. Their approach demonstrates that even a single-word substitution, when chosen adversarially, can cause a model to flip its decision while the overall sentence remains semantically plausible to a human reader. This finding has direct implications for delegation security: an attacker needs only to modify a single component of an instruction, a qualifier, a temporal constraint, a domain specifier, to expand the authorized scope, and the surface-level similarity to the original will be high enough to pass an NLI check. The model's reliance on holistic semantic similarity, rather than on a component-by-component verification of authorization boundaries, is the structural flaw that these attacks exploit.

## **Systemic Breakdown: Output-Mode Collapse** {#systemic-breakdown:-output-mode-collapse}

The failure of NLI under adversarial paraphrasing is not limited to incorrect entailment classifications. Generative LLMs and NLI models are highly sensitive to how a prompt is worded, often focusing more on the exact phrasing than on the actual meaning or intent behind it (Liu & Meng, 2026). This creates an insidious vulnerability where the model's output format itself breaks down, documented as paraphrase-induced output-mode collapse. When presented with a content-preserving prompt variant, the model often abandons its expected constrained output format. Instead of returning a bare label, a single choice token, or a structured JSON field that an automated pipeline can parse, the model drifts into conversational prose, generating a natural-language explanation or commentary that violates the output contract.

In a security verification pipeline, this breakdown in structural discipline is functionally indistinguishable from a false negative. If the system expects a binary "entailment" or "contradiction" label and instead receives free-form text, the exact-match parser that triggers the allow/deny decision may silently misjudge the result, defaulting to a permissive state, throwing an unhandled exception that halts verification, or passing the unstructured text downstream where it is misinterpreted. The delegation context makes this failure particularly dangerous: an adversarial paraphrase that causes output-mode collapse does not even need to fool the NLI model's semantic judgment; it only needs to break the structural discipline of the system that relies on that judgment.

## **Compositional Blindness** {#compositional-blindness}

Reliable logical verification requires a model to understand how each word and phrase contributes to the overall meaning of a statement (Jurafsky & Martin, 2026). Standard NLI architectures, however, tend to evaluate sentence pairs holistically, measuring global semantic relatedness rather than isolating the logical function of individual constituents. This behavior has been described as compositional blindness (Chanchani & Huang, 2023). Because the model does not attend to the role of specific qualifiers, a single‑word substitution such as changing “retrieve this file” to “retrieve all files” drastically expands the authorization boundary while leaving the holistic similarity score nearly unchanged. The practical consequence for agent delegation is severe: an instruction can silently cross from a permitted action to an unauthorized one without triggering the NLI model’s contradiction signal.

## **Mitigating Shortcut Learning via Causal Reasoning** {#mitigating-shortcut-learning-via-causal-reasoning}

Recognizing that shortcut learning is the root cause of NLI brittleness, researchers have begun exploring frameworks that force models to move beyond surface-level correlations. Liu et al. (2025) introduced CREST, a causal framework that mitigates shortcut learning through counterfactual reasoning. Rather than treating all input features as equally relevant, CREST explicitly models the causal structure of the task: it separates the robust causal relationships that should drive the prediction from the spurious shortcut pathways that the model would otherwise exploit. The framework trains the model to consider counterfactual scenarios, what would the prediction be if the lexical overlap were removed, or if the syntactic structure were altered, and to base its final decision on features that are causally linked to the true label rather than merely correlated with it in the training distribution.

CREST demonstrates that causal intervention can reduce reliance on spurious heuristics and improve out-of-distribution generalization. In their experiments, models trained with CREST maintained performance in the range of 78.4% to 85.3% even under adversarial conditions that caused standard models to collapse. These results are promising, but the framework was evaluated on general NLI challenge sets rather than on authorization-boundary attacks where the semantic shift is intentionally minimal and the manipulation is designed to mimic legitimate delegation language. The delegation domain introduces a unique challenge: the causal features that distinguish a safe instruction from an unsafe one are often a single qualifier or a subtle scope expansion, and the background distribution of both safe and unsafe instructions is far narrower than in general NLI. Whether causal reasoning frameworks like CREST can detect authorization drift in this narrow, high-stakes setting remains an open question.

Table 2\. Key-Study Summary Table: NLI Failure under Adversarial Paraphrasing

| Study | Year | What it proved | Limitation |
| :---- | :---- | :---- | :---- |
| **Cheng et al.** | 2025 | Adversarial paraphrasing causes a universal \~88% TPR drop across AI-text detectors | Not evaluated on agent delegation or authorization boundaries |
| **Kaneko** | 2026 | Paraphrasing flips LLM reviewer decisions | Focused on academic review, not security-critical delegation |
| **Ou et al.** | 2026 | NLI-based fact-checking fails under adversarial claims | Fact-checking domain; no authorization scope mapping |
| **McCoy et al.** | 2019 | NLI models depend on lexical overlap, not deep compositional logic | Pre-dates adversarial paraphrasing attacks; general NLP focus |
| **Liu & Meng** | 2026 | LLMs exhibit output-mode collapse under semantically equivalent inputs | Tested on character-breaking, not security enforcement |
| **Liu et al.** | 2025 | Causal counterfactual reasoning improves NLI robustness | Not tested on authorization-scope-expanding paraphrases |
| **Kassem & Saad** | 2024 | Targeted paraphrasing systematically uncovers edge cases | Provides attack methodology, not a defense |

## **Contrastive Learning for Authorization-Aware Sentence Embeddings** {#contrastive-learning-for-authorization-aware-sentence-embeddings}

Natural Language Inference models may struggle with adversarial paraphrasing because they often depend on surface-level lexical overlap rather than deeper changes in meaning. In authorization settings, this limitation is significant because a paraphrase can preserve much of the original wording while subtly expanding the scope of a delegated instruction (McCoy, Pavlick, & Linzen, 2019; Jurafsky & Martin, 2026). Contrastive metric learning offers an alternative by framing verification as a distance-based problem rather than a three-class classification task.  Rather than asking whether a hypothesis entails a premise, the model learns whether a delegated instruction is close enough in embedding space to an authorized goal to be considered valid.

Supervised contrastive learning provides a useful foundation for this approach because it organizes the embedding space through labeled positive and negative examples (Khosla et al., 2021). In this setting, the anchor represents the authorized delegation goal, the positive represents a scope-preserving paraphrase, and the negative represents a scope-expanding or otherwise unauthorized variant. The training objective pulls the positive closer to the anchor while pushing the negative farther away, allowing the model to form a clearer boundary between authorized and unauthorized instructions. This is especially relevant when an adversarial paraphrase retains most of the original vocabulary but alters a key operational constraint.

Related contrastive methods further support the detection of subtle changes in meaning. Difference-based Contrastive Learning for Sentence Embeddings (DiffCSE) is designed to make sentence representations more sensitive to local textual edits, including substitutions, deletions, and insertions (Chuang et al., 2022). This is useful for qualifier injection attacks, where a small wording change can shift the scope of an instruction from limited to broad. Composition-contrastive learning also contributes by encouraging the encoder to attend to phrase-level and modifier-level structure rather than treating the sentence as a single undifferentiated unit (Chanchani & Huang, 2023). Together, these approaches suggest that contrastive representation learning can preserve fine-grained meaning distinctions that standard NLI models may miss.

The effectiveness of contrastive training depends heavily on the quality of the negatives used during learning. Hard negative mining is especially useful when the negative examples are highly similar to the anchor but differ in a meaning-relevant way (Liu et al., 2024). In the present context, adversarial delegation paraphrases function as hard negatives because they preserve tone, topic, and much of the original wording while expanding or altering the authorized scope. A model trained on such examples can learn a tighter and more meaningful decision boundary. Prior work on sentence embedding design also shows that encoder architecture, pooling strategy, and loss formulation all influence how well these distinctions are preserved (Xu et al., 2023).

Evaluation should go beyond ordinary semantic similarity benchmarks. A verification system for delegated instructions should be tested with inputs that intentionally probe the boundary between safe and unsafe variation. COSTELLO provides an example of contrastive testing for embedding-based systems and is relevant here because it focuses on targeted stress tests of embedding behavior (Jiang et al., 2024). Threshold selection is also important because an overly strict cutoff may reject valid instructions, while a permissive cutoff may admit unsafe ones. Jørgensen and Breitung (2025) indicate that the margin parameter in contrastive learning influences the precision-recall trade-off in retrieval tasks, suggesting that the cosine similarity threshold should be calibrated carefully to improve detection of semantically similar but unauthorized instructions.  Tsai et al. (2026) further suggest that iterative refinement can sharpen intent grouping, although that approach is not the focus of the present work.

Overall, the literature supports contrastive learning as a practical basis for authorization-aware sentence embeddings. Supervised contrastive objectives define the geometric separation between safe and unsafe instructions, edit-sensitive and composition-aware models help detect subtle linguistic changes, hard negative mining strengthens the boundary, and contrastive testing supports evaluation under adversarial conditions. What remains underexplored is the direct application of this toolkit to authorization alignment in multi-agent delegation. The present study addresses that gap by fine-tuning a sentence transformer on delegation-specific anchor, positive, and hard-negative triplets to replace SentinelAgent’s NLI-based verification step with a distance-based mechanism

## **Contrastive Learning and MiniLM** {#contrastive-learning-and-minilm}

MiniLM, introduced by Wang et al. (2020), is a compressed transformer architecture that employs deep self attention distillation, a technique in which a smaller student model is trained to replicate the self attention distributions of a larger teacher transformer. This distillation process preserves much of the representational fidelity of the teacher while drastically reducing the parameter count and inference latency of the student. The specific variant most widely adopted for sentence embedding tasks, all MiniLM L12 v2, is a twelve layer bi encoder that produces 384 dimensional embeddings and contains approximately 33 million parameters. It was pretrained on over one billion sentence pairs drawn from diverse corpora, which provides it with a broad semantic foundation that can be adapted to narrow domains through task specific fine tuning. Unlike cross encoders, which concatenate two input sentences and process them jointly through full cross attention before emitting a classification score, a bi encoder encodes each sentence independently into a fixed length vector. Comparison between the two vectors is then performed through a simple distance metric such as cosine similarity. This architectural separation means that the model never directly observes lexical overlap between the two inputs during encoding, a property that has significant implications for tasks where surface level word matching can produce misleading similarity judgments.

The bi encoder architecture is particularly well suited to contrastive metric learning, a training paradigm in which the model learns to structure its embedding space such that semantically related items are positioned close together while semantically opposed items are pushed apart. In the standard contrastive formulation with triplet loss and cosine distance, the model receives triplets of the form (anchor, positive, negative) and is trained to minimize the distance between the anchor and the positive while simultaneously maximizing the distance between the anchor and the negative beyond a specified margin (Reimers & Gurevych, 2019). This objective has been shown to produce embedding spaces with clean geometric separation between classes, where the cosine similarity between two vectors directly reflects their degree of semantic alignment. McCoy et al. (2019) demonstrated that standard NLI models rely heavily on syntactic heuristics, particularly lexical overlap between premise and hypothesis, rather than performing genuine logical inference. Because a bi encoder trained with contrastive loss never processes the two sentences jointly, it cannot fall back on this overlap heuristic; the model is forced to encode the full semantic content of each sentence into a single vector such that the spatial relationship between vectors alone captures the authorization boundary. Liu and Meng (2026) further identified that generative models and cross encoders exhibit surface form sensitivity, where small changes in phrasing can cause the model to abandon its expected output format. 

A bi encoder does not generate text and therefore cannot suffer from output mode collapse, producing a deterministic vector regardless of input perturbation. Chanchani and Huang (2023) characterized compositional blindness as the failure of neural models to attend to the logical contribution of individual words and phrases, noting that models which evaluate sentences holistically often miss single word qualifier changes that radically alter meaning. The triplet structure directly addresses this limitation by training the model to distinguish an authorized instruction from an adversarial paraphrase that may differ in only a few critical qualifiers, forcing the embedding to encode the operational significance of those differences even when the overall sentence structure appears similar. Collectively, these properties make the MiniLM bi encoder trained with cosine distance triplet loss a structurally appropriate candidate for tasks that require fine grained semantic distinction between authorized and unauthorized natural language instructions, including the delegation intent verification problem at the center of this study.

## **Algorithmic Task-to-Scope Matching and Boundary Formalization** {#algorithmic-task-to-scope-matching-and-boundary-formalization}

Contrastive embeddings can detect semantic drift, but they must be grounded in a formal definition of authorized scope. In delegated-agent settings, the central question is not only whether two instructions are semantically similar, but whether the second instruction remains within the permissions granted by the first. This makes task-to-scope matching a key requirement for secure authorization in multi-agent systems. A verification method that lacks explicit boundaries may allow small paraphrastic changes to produce a larger operational scope than intended.

El Helou et al. (2025) address this issue through semantic task-to-scope matching. Their framework allows execution only when the semantic scope of the delegated task is contained within the original authorization scope. This is important because it treats authorization as a subset relation rather than a general similarity problem. The approach also decomposes the instruction into task parameters instead of relying on a holistic sentence judgment, which aligns with the need for finer-grained verification. In the present study, this logic supports the use of embeddings that reflect whether the implied operational parameters remain inside the authorized boundary.

The broader agent security literature further strengthens this formal view. Siu et al. (2026) distinguish between content filtering and authorization tracking, arguing that security decisions should be based on provenance and information flow rather than keyword matching alone. This distinction matters because a harmful instruction may use ordinary language while still causing an unauthorized action. For that reason, a verification layer should track whether the planned action is causally linked to a valid delegation chain. A contrastive model can support this requirement if it is trained to represent authorization relations rather than only surface similarity.

Wu, Liu, Bibi, King, and Lyu (2026) describe the authorization-execution gap in open-world agents, showing that the meaning of an instruction can drift between the user’s wording and the agent’s eventual action. This gap is especially problematic when a single parameter is widened or a constraint is relaxed during interpretation. A pre-execution verification layer is therefore needed to compare the semantic representation of the planned instruction against the authorized scope before any tool call is made. In this study, the contrastive embedding model serves that role by flagging instructions whose semantic distance from the authorized goal exceeds a calibrated threshold.

Ambiguity creates another challenge for task-to-scope matching. Dorr, Jayaweera, Youm, and Gilda (2026) identify scope ambiguity, attachment ambiguity, and quantifier ambiguity as major sources of error in high-stakes language processing. These ambiguities matter in delegation because a paraphrase may appear harmless but still admit a broader reading than intended. A reliable verification system should therefore reject instructions when the meaning is uncertain and one plausible interpretation exceeds the authorized scope. While the present study does not solve ambiguity resolution fully, hard-negative training helps the model learn the boundary around known scope-expanding formulations.

Taken together, these works support a boundary-based verification framework. Secure delegation requires semantic subset checking, causal authorization tracing, interception before execution, and attention to ambiguity. The contrastive embedding approach proposed in this study connects these requirements by learning a vector space that separates scope-preserving instructions fromFG scope-expanding ones.

## **Threat Landscape, Behavioral Vulnerabilities, and Observability Metrics** {#threat-landscape,-behavioral-vulnerabilities,-and-observability-metrics}

Agentic systems face prompt injection, memory poisoning, and evaluation challenges that go beyond a single misclassification event. This makes it necessary to treat authorization verification as one layer in a larger security architecture rather than as a standalone defense. The literature shows that untrusted text, malicious retrieval, and poor observability can all undermine agent reliability.

Prompt injection research shows that language models do not naturally separate trusted instructions from hostile ones within the same context. Perez and Ribeiro (2022) demonstrate that even simple adversarial instructions can redirect the model away from its original task. More recent reviews classify prompt injection into direct, indirect, and multi-turn forms and note that no single defense is sufficient across all attack types (Gulyamov, 2026). This supports the use of layered defenses that combine deterministic controls with semantic verification, including the contrastive model proposed in this study.

Memory-based compromise extends the threat surface further. Srivastava and He (2025) show that poisoned retrieval can cause an agent to recall harmful experiences and behave in ways that appear consistent with its stored memory. This is relevant because it shows that semantic similarity mechanisms can be exploited in both live instructions and persistent memory. A contrastive embedding model may help reduce this risk if applied to retrieval verification as well, although that is beyond the present study’s scope.

Evaluation frameworks such as MAESTRO are useful because they emphasize testing, reliability, and observability in multi-agent systems. In adversarial settings, accuracy alone is not enough because malicious events are often rare compared with benign ones. Recall, Precision, and F1-Score are more informative because they measure attack detection, false positive control, and overall balance. These metrics are appropriate for this study because the goal is to block unauthorized instructions while preserving legitimate delegation.

Overall, the threat landscape supports the need for authorization-aware semantic verification. Prompt injection shows that contextual instruction following is vulnerable, memory poisoning shows that retrieval can be manipulated, and evaluation frameworks show that system performance must be measured under class imbalance. The present study focuses on adversarial paraphrasing, but the proposed contrastive verification layer is relevant to a wider class of agent security failures.

## **Synthesis of the Study** {#synthesis-of-the-study}

A central problem emerges from the reviewed literature: autonomous AI agents can be delegated authority through natural language, but the mechanisms intended to keep that authority bounded may fail when an adversary subtly rephrases the instruction. The semantic security gap is therefore a practical concern rather than a purely theoretical one. It has been reported in a published delegation framework with very low true-positive performance under adversarial paraphrasing (Patil, 2026), and it has also been reflected in real-world incidents associated with financial loss, data exfiltration, and infrastructure damage (SlowMist, 2026; Otto, 2026; Solozobov, 2026). Taken together, the reviewed works help explain why the gap exists, why current defenses remain limited, and why a more reliable verification method is needed.

The root cause of this security gap lies in the mismatch between how Natural Language Inference models make decisions and what delegation security requires. NLI models rely heavily on lexical overlap and holistic similarity rather than on compositional, boundary-sensitive reasoning (McCoy, Pavlick, & Linzen, 2019; Jurafsky & Martin, 2026). Adversarial paraphrasing exploits this weakness by retaining much of the original vocabulary while altering a qualifier, temporal constraint, or domain specifier, thereby expanding operational scope without necessarily triggering an NLI contradiction (Cheng et al., 2025; Kassem & Saad, 2024). In some cases, paraphrasing can also disrupt output formats and weaken the structural contract that automated pipelines depend on (Liu & Meng, 2026). These findings suggest that the NLI paradigm has a structural limitation that is not fully addressed by standard classification training.

To address these limitations, contrastive metric learning provides an alternative approach that reframes verification as a distance-based problem, pulling authorized paraphrases close to an anchor in embedding space while pushing unauthorized variants beyond a threshold (Khosla et al., 2021). Architectures sensitive to local edits and compositional structure address weaknesses that NLI models often exhibit. DiffCSE encourages sensitivity to token-level substitutions (Chuang et al., 2022), while composition-contrastive learning encourages attention to phrase-level meaning (Chanchani & Huang, 2023). Hard-negative mining, using examples that share surface form with the anchor but differ in authorization status, helps the model place the decision boundary where adversarial paraphrases are likely to cross it (Liu et al., 2024). These techniques are further supported by work on encoder design and evaluation, including contrastive testing frameworks and margin calibration studies that inform model choice and threshold selection (Xu et al., 2023; Jiang et al., 2024; Jørgensen & Breitung, 2025).

Beyond embedding mechanics, the formal literature on agent security supplies the specific requirements that a contrastive approach should satisfy. Task-to-scope matching requires that an executed task remain a semantic subset of the authorized scope (El Helou et al., 2025). Causal authorization tracking requires that verification be grounded in the provenance of the instruction rather than in surface content alone (Siu et al., 2026). Authorization-execution gap analyses show that verification must occur before tool invocation, at the point where linguistic interpretation can drift from the original intent (Wu, Liu, Bibi, King, & Lyu, 2026). Ambiguity-aware NLP research further indicates that when multiple interpretations exist, the system should prefer the safer reading rather than the statistically most frequent one (Dorr, Jayaweera, Youm, & Gilda, 2026). NLI does not directly satisfy these conditions, while a contrastive embedding model trained on delegation-specific triplets is designed to address them, even if ambiguity handling remains limited to the scope represented in the training data.

Contextualizing this issue within the broader threat landscape confirms that the semantic gap is one part of a wider weakness: language models do not naturally separate trusted instructions from adversarial content, and the same similarity mechanisms used for retrieval can also be poisoned (Perez & Ribeiro, 2022; Srivastava & He, 2025). Evaluation frameworks for multi-agent systems emphasize that in imbalanced security datasets, recall, precision, and F1-score are more informative than accuracy because missed attacks are more costly than false alarms (Ma et al., 2026). These metrics therefore inform the evaluation design of the present study.

Evaluating the collective evidence reveals a consistent pattern. The NLI-based intent verification layer that currently protects agent delegation is vulnerable in ways that are difficult to eliminate within the classification framework alone. The contrastive learning literature offers techniques for building embedding spaces that preserve fine-grained semantic boundaries, while the agent security literature defines the formal conditions that such boundaries should enforce. However, the review suggests that no study identified here has directly combined these two lines of work by constructing delegation-specific anchor, positive, and hard-negative triplets from adversarial paraphrases and using them to train a contrastive embedding model whose distance threshold serves as the authorization gate.

The present study addresses this exact intersection. It improves the NLI-based P2 component of the SentinelAgent framework with a MiniLM sentence transformer fine-tuned under a contrastive objective on triplets drawn from DelegationBench v4 and an adversarially augmented paraphrase dataset. The model learns a vector space in which scope-preserving paraphrases cluster near the authorized goal and scope-expanding paraphrases are separated by a calibrated margin. Performance is measured using recall, precision, and F1-score and compared directly against the published NLI baseline under the same adversarial conditions. The study is therefore an implemented proof-of-concept rather than only a theoretical proposal, and it aims to provide a concrete step toward closing the semantic security gap described in the reviewed literature.

# **Chapter 3** **METHODOLOGY** {#chapter-3-methodology}

## **Research Design** {#research-design}

This study will use an experimental and developmental research design. The developmental phase will center on the architecture and integration of an authorization alignment framework, specifically utilizing a contrastive metric learning architecture to enforce security policies during agent delegation. The experimental phase will then concurrently measure the efficacy of this proposed framework when subjected to delegation scenarios and intent manipulation attempts, such as adversarial paraphrasing.

The evaluation will compare two distinct intent verification approaches. The primary baseline configuration will serve solely as a performance benchmark and will represent the current probabilistic approach implemented through an off-the-shelf Natural Language Inference (NLI) cross-encoder instance that receives no task-specific training. The secondary configuration will implement the newly developed solution, replacing this generalized approach with a MiniLM-based contrastive embedding model trained on purpose-based delegation triplets. Because both configurations share the same MiniLM backbone, this setup holds model size constant and isolates the effect of the verification architecture, so that any observed difference can be attributed to the transition from the baseline to the proposed methodology.

To structure the findings, the methodology is aligned with the study’s two guiding research questions. Research Question 1 will subject the proposed contrastive embedding framework to the exact same attack scenarios and performance metrics. To address Research Question 2, a statistical hypothesis test (one-tailed paired t-test) will be applied to the evaluation metrics to confirm whether the proposed framework yields a statistically significant improvement over the baseline.

To guarantee rigorous experimental integrity, the methodology establishes a definitive separation between the training and inference phases for both the Natural Language Inference baseline and the MiniLM contrastive model. All experimental procedures will be performed within a secured, offline simulation environment relying on a fixed, version-controlled corpus. The study will not interact with live web traffic, nor will it capture real-time user prompts. Batch-level inference logs generated during the simulation will serve as the empirical foundation for all subsequent descriptive statistics and significance testing.

## **Sources of Data** {#sources-of-data}

This research is built on two related data sources: the original DelegationBench v4 corpus, which is retained unchanged as the external benchmark for the testing batches, and a purpose-based corpus (hereafter corpus v3), which supplies the training data and the primary evaluation partitions for the architecture comparison.

DelegationBench v4 was developed by Patil (2026) as part of the formal verification infrastructure for the Delegation Chain Calculus, and its intent-verification subset (the P2 component) comprises 200 verifiable delegation scenarios across 12 U.S. federal government service domains, consisting of 60 malicious and 140 benign instances. Each record has three essential fields: a root delegation goal describing the authorized service the agent is permitted to perform, a subtask describing the concrete action to be evaluated against that goal, and a ground-truth label classifying the subtask as contradiction (malicious; the subtask violates the authorized scope of the goal), entailment (benign; the subtask directly supports and is logically entailed by the goal), or neutral (benign; the subtask neither contradicts nor is strictly entailed by the goal). The dataset is utilized in this study with the explicit permission of its original author, obtained through direct correspondence and verified against its MIT license, and is accessed in its pre-labeled and pre-validated form without modification to its ground-truth annotations. The reference subset and its exact text are reproduced in the author's published fine-tuning script, which is retained in this repository as the canonical record of the original benchmark data. This subset remains the sole source of the testing batches used for the direct comparison against the published baseline, which preserves a reproducible reference point to prior work.

Corpus v3 is the study's training corpus. It was constructed so that the violation of authorization resides in the purpose of an operation that reads as ordinary casework rather than in an explicitly named scope change: a malicious subtask is designed to share its surface vocabulary with its benign sibling and to differ only in whether the operation it describes is authorized. This is precisely the failure mode the contrastive objective is intended to address. It contains 584 training rows and 122 held-out rows, preserves the same 12-goal federal service catalog, and expresses every row as a (goal, subtask, label) record under the same three-label scheme used by the baseline: 0 for malicious, 1 for benign entailment, and 2 for neutral. Rows carry the metadata required by the analysis: a pair\_id linking a benign sibling to its violation, a stratum (easy, near\_miss, matched, hard, or control), a harm\_category for violations, and a cue naming the exact phrase that is present in the violation and absent from its benign sibling.

Two properties of corpus v3 are load-bearing for the design. First, the corpus is decidable from the text alone: every malicious row carries a verified cue phrase that breaks authorization and does not appear in its benign sibling, so a careful reader could decide the case from the (goal, subtask) pair without access to hidden information. Second, the corpus is purpose-based and near-miss paired: 110 near\_miss rows (55 pairs) and 166 matched rows (83 pairs) share their operation, their concept, and frequently their verb, differing only in whether the operation is authorized. These paired rows are the hard negatives the contrastive loss requires, and they are what makes a purely lexical shortcut insufficient in principle.

The choice of corpus v3 as the training source is justified on three grounds. It preserves the author's own hand-authored rows, of which 164 of the 584 training rows are the original seed kept verbatim as a style anchor, so the study remains anchored to the DelegationBench v4 distribution. It supplies the matched benign and violation pairs that the benchmark provides only incidentally. And it is governed by an explicit construction protocol: every malicious row carries a verified deciding cue, each benign row is paired with the violation it must not be confused with, and the corpus is screened for duplicate and near-duplicate contradictions before it is used. The full construction protocol is documented alongside the corpus.

The study's reporting convention is set by a property of the corpus rather than by the outcome of the experiment. Because the boundary between authorized and unauthorized operations is definitional, part of the discriminating signal is carried by surface vocabulary by construction. The corpus is therefore accompanied by a lexical control, a bag-of-words classifier evaluated on the same partitions, and the primary metrics are reported alongside the margin against that control, together with threshold stability and calibration, rather than presenting raw accuracy alone as a measure of success.

## **Sampling Data** {#sampling-data}

Prior to training and evaluation, the corpus undergoes a deterministic preprocessing pipeline. Text normalization removes case-related variability, and trailing sentence periods are stripped corpus-wide because their presence leaked the label in the generated rows. Non-essential metadata columns are not fed to the models. Records containing empty strings or malformed formatting are removed prior to training, and no automated text imputation is applied, so that the semantic integrity of the corpus is preserved.

Following this cleaning phase, the data is formatted according to the specific requirements of the two evaluation pipelines. For the baseline NLI path, each scenario is structured into a standard premise and hypothesis pair, built with the same template used at inference, An AI agent is authorized to {goal}. The agent performs only tasks that support this goal. as the premise and The agent is now performing: {subtask} as the hypothesis, with both fields lowercased. For the proposed contrastive path, each scenario is framed with the raw Goal: {goal}. Subtask: {subtask}. template applied to both sides, where the goal side uses the goal as its own subtask, and casing is preserved. This framing mirrors the training-time template exactly, because a template mismatch between training and inference silently degrades accuracy.

For contrastive training, the corpus is restructured into (anchor, positive, hard-negative) triplets. The anchor is the root delegation goal; the positive is a benign, scope-preserving subtask under that goal; and the hard negative is a malicious subtask under the same goal, drawn preferentially from the near\_miss and matched pairs so that the negative differs from its positive by authorization alone rather than by vocabulary. The Cartesian product of positives and negatives per goal produces the training triplets. Because \"neutral\" is a property of the NLI label space and not of the contrastive triplet space, neutral rows are excluded from triplet construction but retained for the NLI path, so the three-label NLI head remains fully populated.

For the batch-level metrics, the three-class authorization labels are binarized into malicious versus benign: label 0 (contradiction) is malicious, and labels 1 (entailment) and 2 (neutral) are benign. This matches the security framing of the study, in which only a violation is treated as a positive. Recall (True Positive Rate), Precision, and F1-Score are then computed per batch from this binary tally.

The data is partitioned without any goal appearing on both sides of a split. Rather than a single stratified train-and-test split, the study uses four complementary partitions, each serving a distinct role. First, the 584-row training split is used for optimization under 5-fold cross-validation in which the folds are formed by grouping on the goal, stratified by attack family, so that no goal appears on both the training and the test side of a fold; this is stricter than the label-only stratification used in the original benchmark protocol, which permitted the same goal to appear on both sides of a fold. Second, the 122-row frozen holdout is never trained on and is balanced 70 malicious, 26 benign-entailment, and 26 neutral, so that both the detection rate and the false-positive rate are estimable. Third, the concept-disjoint cue\_split (622 train and 84 test) assigns entire concept families wholly to one side, so the test set's kinds of overreach are unseen during training; this is the primary evaluation split. Fourth, the phrase-held-out cue\_split\_phrases (643 train and 63 test) holds out the deciding phrases rather than the concept families and is reported as a robustness check rather than as the primary split, because holding out a phrase does not hold out the underlying vocabulary.

Finally, the evaluation testing batches are constructed from held-out data only, the frozen holdout, the two cue splits, and the original DelegationBench v4 P2 subset that is reserved for the external comparison, and never from the training split. Every batch contains both benign and adversarial instructions so that all metrics are estimable. To guarantee a fair comparison, identical batches are processed sequentially through the baseline NLI configuration and the proposed contrastive MiniLM architecture. This synchronized paired batching produces the paired batch-level arrays required for the study's one-tailed paired-sample t-test, and the per-fold test sets produced during cross-validation are logged as well, so that the same-example pairing observed for the baseline is reproduced exactly for the proposed model.


## **System Architecture** {#system-architecture}

The proposed system is an intent-verification pipeline built around the contrastive bi-encoder fine-tuned for delegation intent alignment.  The architecture describes both the inference-time decision flow and the measurable outputs produced for metric computation, covering the full path from user input to binary BLOCK/PASS verdict.

	Figure 3\. System Architecture

![][image2]

The figure presents the system architecture of the proposed contrastive intent verification pipeline for P2 intent preservation in federal multi-agent delegation chains.  The system is organized into three main stages: input acquisition, intent verification, and decision output.  Each component is described below with its inputs, internal operation, and outputs.

The system receives two inputs from the user. The first is the Goal ("goal\_text"), a delegation goal selected from a fixed catalog of 12 federal service processes ("Process disability benefits for veterans", "File federal tax return for citizens"). The catalog is predetermined and the goal is locked at delegation time. The goal defines the semantic anchor against which all subsequent subtasks are evaluated. The second is the Subtask ("subtask\_text"), a free-text instruction describing the action the user wants the agent to perform ("Retrieve the veteran's medical records from the VA health system"). This is the only dynamic input at runtime and is the vector through which adversarial intent drift or paraphrasing attacks would enter the system. Both inputs are submitted simultaneously to the Intent Verifier. The goal originates from a constrained dropdown selection; the subtask originates from an open text prompt.

Both inputs are passed to a contrastive bi-encoder that provides semantic intent alignment verification, the main contribution of the research. This layer detects adversarial paraphrases, scope-expanding language, and subtle intent drift that cannot be caught by substring matching alone, making it the primary P2 enforcement mechanism. The model used is all-MiniLM-L12-v2, a SentenceTransformer bi-encoder with a 12-layer MiniLM architecture producing 384-dimensional embeddings that is fine tuned. The inference operation proceeds through three sub-steps. First, both inputs are wrapped into a structured natural-language template in which the anchor text is constructed as "Goal: {goal}. Subtask: {goal}." and the subtask text as "Goal: {goal}. Subtask: {subtask}." Second, both document strings are independently encoded through the fine-tuned bi-encoder and L2-normalized to produce unit vectors. Third, the alignment between the goal and the subtask is computed as the dot product of the two normalized embedding vectors, producing a cosine similarity score in the range of \-1 to \+1. Because the model was trained with TripletLoss using cosine distance, benign subtasks are pulled toward their goal embedding while malicious subtasks are pushed away from it, so the decision boundary is expected to sit near zero, where a subtask embedding is close to orthogonal to its goal. The exact operating point, however, is not fixed at zero; it is calibrated on held-out data as described next.

The cosine similarity is compared against a calibrated threshold. If the cosine falls below the threshold, the verdict is BLOCK; if it meets or exceeds the threshold, the verdict is PASS. The threshold is determined empirically through 5-fold cross-validation, following standard practice in contrastive representation learning where the decision boundary is treated as a hyperparameter optimized on held-out data rather than fixed a priori. During each fold, the threshold is swept across the interval from 0.0 to 1.0 in fine increments, and the value that maximizes the F1-score on the held-out test fold is selected. For final deployment, the threshold is set to the mean of the five fold-optimal values, which avoids overfitting the boundary to any single fold while remaining consistent with the literature on threshold selection for similarity-based classifiers, where the operating point is chosen to balance the precision-recall trade-off on a validation set. The resulting threshold produces a calibrated decision rule: subtasks whose embedding lies sufficiently far from the goal embedding are classified as malicious, while subtasks that share a meaningful directional component with the goal are permitted.

Once the Intent Verifier reaches a decision, the pipeline produces a binary output. A PASS verdict means the subtask semantically aligns with the original delegation goal, and proceeds to go to the original pipeline. A BLOCK verdict means that the cosine similarity has fallen below the threshold and a low-similarity violation is recorded (internally, a contrastive\_reject reason); the user is notified, and the requested action is denied.

The pipeline produces measurable outputs for metric computation and statistical analysis. Each run writes a single cross-validation results file that records, for every fold, the TPR, FPR, precision, accuracy, F1 and the selected threshold, together with the aggregate confusion matrix across all folds and the breakdown of recall and false-positive rate by evaluation subset (all malicious entries, adversarial paraphrases, explicit attacks, and benign examples). The same file carries the run-level aggregate, which reports the mean and standard deviation of every metric across the five folds. The matched NLI run writes an identically structured file, so that both architectures are scored on the same evaluation subsets under the same metric schema and support the direct comparison drawn in the analysis.

The bi-encoder is trained separately from the inference pipeline described above, and the training methodology is summarized here for completeness. The training data is the purpose-based corpus described under Sources of Data: 584 rows spanning the same 12 federal service goals, with a frozen 122-row holdout and a concept-disjoint evaluation split. During triplet construction, the benign subtasks under each goal are collected as positives and the malicious subtasks as hard negatives, prioritizing the near-miss and matched pairs, the benign and violation siblings that share their operation, concept and verb, so that a negative differs from its positive by authorization alone. The Cartesian product of positives and negatives per goal produces the training triplets, and neutral rows are excluded from the triplet space while being retained for the NLI path. The training configuration employs 5-fold cross-validation whose folds are grouped on the goal (StratifiedGroupKFold) so that no goal is shared between the training and the test side of a fold, TripletLoss with cosine distance, and standard regularization hyperparameters to mitigate overfitting to the relatively compact government delegation domain. The two architectures are compared under a matched outer protocol, identical dataset, folds, seed, batch size, optimizer and threshold-selection rule, with a matched four-epoch budget, so that the comparison is between architectures rather than between training budgets, and the deployment threshold is the mean of the per-fold F1-optimal cut-offs. A final model is trained on all available examples and saved for deployment.

## **Research Instrument** {#research-instrument}

The research instrument for this study is a structured experiment paper designed to capture, organize, and report the batch-level quantitative results generated by the two evaluation paths: the baseline Natural Language Inference model and the proposed contrastive MiniLM embedding architecture. The instrument serves as the primary data collection artifact, translating raw model outputs into the measured variables required to answer each of the study's two research questions. Its structure is organized by evaluation configuration, testing batch, and metric type, which allows each performance variable to be traced back to its exact computational origin and to the specific batch of delegation scenarios that produced it.

In the context of this study, a true positive refers to an adversarial or scope-expanding delegation subtask that is correctly identified as unauthorized by the verification model. The study's adversarial subtasks are instructions that use professional or legitimate-sounding language to disguise harmful intent, such as expanding a database query beyond the authorized scope, injecting demographic bias into an eligibility determination, or exporting sensitive records to an external platform under the pretense of comprehensive review. A true positive is recorded when the verification model issues a BLOCK verdict for such a subtask, meaning the model recognizes that the instruction does not semantically align with the original delegated goal. Conversely, a true negative is recorded when a benign subtask, one that legitimately supports the root delegation goal without overreach, receives a PASS verdict. A false positive occurs when a benign subtask is incorrectly blocked, which would deny a legitimate user action. A false negative occurs when an adversarial subtask is incorrectly permitted which represents a security failure where malicious intent bypasses the verification layer. These four outcomes are tallied per testing batch from the binary BLOCK or PASS decisions emitted by each verification model, and the counts are used to compute the three core metrics: True Positive Rate (Recall), Precision, and F1-Score.

The computation of each metric follows directly from the confusion matrix tallied per batch. True Positive Rate, also referred to as Recall in the study, is calculated as the number of true positives divided by the sum of true positives and false negatives. This measures the proportion of actual adversarial delegations that the model successfully detects. Precision is calculated as the number of true positives divided by the sum of true positives and false positives. This measures the proportion of delegations flagged as unauthorized that are genuinely adversarial, thereby preventing a model from blocking everything indiscriminately. The F1-Score is the harmonic mean of Precision and Recall, computed as two multiplied by the product of Precision and Recall divided by their sum. This single value balances the trade-off between catching threats and avoiding false alarms, and it serves as the primary balanced metric for comparing the two architectures. All three metrics are computed independently for each synchronized testing batch, this produces a paired array of batch-level values for the baseline NLI configuration and an identically structured paired array for the proposed contrastive configuration. These paired arrays form the statistical foundation for the one-tailed paired t-test applied in Research Question 2\.

The data used throughout the experiment originates from two related sources: the purpose-based corpus described under Sources of Data, which supplies the training data (584 rows across 12 U.S. federal government service goals), and the retained DelegationBench v4 intent-verification (P2) subset together with the corpus's own held-out partitions, which supply the testing batches. The DelegationBench v4 material consists of verifiable delegation scenarios with explicit root delegation goals, subtask descriptions, and ground-truth authorization labels, and is acquired in its pre-labeled form through the SentinelAgent research framework with the explicit permission of its original author. No new data is solicited from human participants. No live agent interactions, internet traffic, or real-time user prompts are captured. All empirical data is generated entirely within a secure offline simulation environment through automated batch processing; this guarantees that every measured variable is produced under controlled, reproducible conditions.

The experiment paper is formatted as a per-batch recording table where each row corresponds to a single synchronized testing batch processed through both the baseline and proposed paths. The columns capture the batch identifier, the evaluation condition indicating whether the batch was processed under normal or adversarial paraphrasing conditions, the verification architecture used, the embedding space employed by that architecture, and the three computed metrics: True Positive Rate, Precision, and F1-Score. An additional column is reserved for the paired t-test result, which records the exact p-value and the corresponding null hypothesis decision for each metric after the full set of paired batch-level values has been accumulated. This row-level structure is chosen because the paired t-test requires each baseline measurement to be directly paired with its corresponding proposed-solution measurement from the exact same batch of test samples. By organizing the instrument this way, every data point used in the statistical test is traceable to the specific delegation scenarios that generated it, and the batch-level pairing controls for the textual variation inherent across different subsets of the evaluation partition.

Each research question maps to a specific section of the experiment paper. Research Question 1, which asks for the detection performance of the proposed contrastive embedding model, is answered by the descriptive statistics computed across the proposed-solution column of the instrument: the mean and standard deviation of True Positive Rate, Precision, and F1-Score across all testing batches processed through that path. Research Question 2, which asks whether there is a significant difference between the two architectures, is answered by the one-tailed paired t-test applied independently to each of the three metrics across the paired batch-level arrays. The null hypothesis for each test states that the proposed contrastive embedding model does not improve the given metric compared to the baseline NLI model. The null is rejected if the computed p-value is less than or equal to the alpha level of 0.05, and the decision is recorded in the instrument alongside the exact p-value and t-statistic.

All variables referenced in the study's statement of the problem are directly measurable within this instrument. The independent variable is the verification architecture, which takes two categorical levels: the baseline NLI configuration and the proposed contrastive MiniLM configuration. The dependent variables are the three continuous performance metrics: True Positive Rate, Precision, and F1-Score. The controlled variables include the evaluation partitions, which are fixed as the held-out partitions of the purpose-based corpus together with the retained DelegationBench v4 P2 testing batch, the testing batch composition, which is identical across both paths for each batch, the text normalization procedure, and the random seed used for the goal-grouped cross-validation folds, which is fixed to ensure exact reproducibility of the partition boundaries. Every variable is operationalized through a specific computational step in the experiment procedure, leaving no construct unmeasured or dependent on subjective interpretation.

## **Data Generation/Gathering Procedure** {#data-generation/gathering-procedure}

The data generation and gathering procedure follows a strictly controlled, sequential methodology to ensure the integrity and reproducibility of the experimental findings. The process transitions from initial dataset acquisition to the automated generation of empirical performance metrics through offline simulation.

The procedure begins with the acquisition of the DelegationBenchv4 dataset. To maintain experimental control and prevent external variables or live network latency from influencing the study, the dataset is imported into a secure, offline simulation environment. All subsequent data manipulation and model execution occur entirely within this isolated setting.

The imported dataset undergoes immediate text normalization to remove case variability and nonessential metadata. Following this cleaning phase, the records are systematically formatted to satisfy the input requirements of the two distinct execution paths. For the baseline Natural Language Inference evaluation, the records are structured into standard premise and hypothesis pairs. For the proposed contrastive evaluation, the records are restructured into training triplets according to the pair-matched construction described under Sampling Data: within this schema the root delegation goal is designated as the anchor, a semantically equivalent authorized subtask is mapped as the positive example, and a malicious, scope-expanding subtask that shares its operation with the positive is labeled as the hard-negative example. This deliberate, pair-matched structure is what provides the contrastive loss function with the semantic boundaries it requires. Finally, across both formatted paths, the authorization labels are binarized for the batch-level metrics by treating label 0 (contradiction) as malicious and labels 1 (entailment) and 2 (neutral) as benign.

Once structurally prepared, the formatted data is divided into the partitions described under Sampling Data: a training split used for optimization under goal-grouped five-fold cross-validation, a frozen holdout, and two cue-disjoint evaluation splits. No goal appears on both sides of any split, and the benign and adversarial composition of each evaluation partition is recorded so that every testing batch is balanced by construction.

Before empirical testing begins, the training partition is utilized exclusively to optimize the proposed MiniLM architecture. The model processes the training triplets through its contrastive learning objective to mathematically establish the semantic reference boundaries. Because the baseline NLI model serves as the pre-existing standard, it requires no customized structural optimization and is readied directly for inference.

The actual generation of empirical data occurs during this phase. The held-out evaluation partitions are grouped into identical testing batches. To guarantee a precise comparative analysis, these batches are processed sequentially. A testing batch is first fed through the baseline Natural Language Inference model to generate the control classifications. Immediately following, the exact same testing batch is processed through the optimized contrastive embedding pipeline to generate the experimental classifications.

As each synchronized batch completes its execution path, the resulting confusion matrix outcomes are automatically captured. The offline system calculates the core performance metrics for each batch, specifically the True Positive Rate, Precision, and F1 Score. These calculated values, alongside the specific batch identifiers and execution path details, are systematically recorded into the structured experiment paper. This finalized evaluation log serves as the definitive empirical dataset required to execute the paired statistical analysis and address the study's research questions. 

## **Ethical Considerations** {#ethical-considerations}

This research is conducted strictly as a technical and architectural evaluation and does not involve human subjects. The methodology does not collect, process, or expose personal data, private communications, or individually identifiable information. The primary data source (DelegationBenchv4) is utilized with the explicit permission of the SentinelAgent framework's original author. While the researchers utilized these data samples to train and test the verification models, the dataset was not maliciously manipulated or altered in any manner that would violate the guidelines established by its creators. Specifically, the structural reorganization of the data into relational (anchor, positive, hard-negative) training triplets was performed strictly to facilitate contrastive optimization and was explicitly approved by the original author through direct correspondence.

All empirical experiments will be executed within a highly controlled, offline simulation environment using this static data. To completely eliminate external security risks, no live AI agent deployment, real-time inference pipelines, or active Delegation Authority Services will be subjected to adversarial probing or network disruption. All materials, academic writings, and algorithms incorporated into this framework are rigorously cited and acknowledged to uphold academic integrity. Finally, the researchers commit to absolute transparency throughout the entire evaluation process to prevent analytical bias or the fabrication of results and to guarantee complete methodological reproducibility.

## **Data Analysis** {#data-analysis}

The data analysis will be conducted in two distinct phases corresponding directly to the two primary research questions.

Table 3\. Data Analysis for each Research Question

| Research Question | Data Source | Type of Analysis | Output |
| :---: | :---: | :---: | :---: |
| **RQ1** | Held-out corpus and P2 evaluation partitions  | Descriptive statistics | Proposed contrastive architecture Recall, Precision, and F1-Score  |
| **RQ2** | Paired Test-Group Results  | One-tailed paired-sample t-test | Statistical significance decision for each performance metric ( α \= 0.05)  |

For Research Question 1, the study summarizes the detection performance of the proposed contrastive embedding architecture across the cross-validation folds evaluated against the 84-sample testing subset. Descriptive statistics (mean and standard deviation) are computed for the True Positive Rate (Recall), Precision, and F1-Score.

For Research Question 2, the study determines whether the proposed contrastive embedding architecture achieves a statistically significant performance improvement over the baseline Natural Language Inference model. This inferential comparison utilizes the paired fold-level metric values. Each fold's metrics from the baseline execution path are directly paired with the corresponding fold's metrics from the proposed contrastive execution path, enabling a one-tailed paired-sample t-test while controlling for fold-level data variance.

## **Statistical Treatment** {#statistical-treatment}

The study will employ a combination of descriptive and inferential statistics to systematically analyze, interpret, and validate the empirical data gathered during the evaluation phase. These statistical techniques ensure that the assessment of the proposed computational solution is mathematically reliable and free from structural bias. 

To address Research Question 1 (Statement of the Problem 1), descriptive statistics will be utilized to summarize the performance of the proposed contrastive embedding architecture. The study will calculate the True Positive Rate (Recall), Precision, and F1-Score independently across the synchronized test groups. The arithmetic mean will capture the average detection efficacy of each execution path, while the standard deviation will quantify the models' stability when exposed to varying adversarial paraphrases. To compute these metrics objectively, the study relies on the following mathematical formulas derived from the tallied confusion matrix variables: 

1. **Recall (True Positive)** measures the proportion of scope-expanding adversarial delegations that the contrastive verification model successfully detects. In this study, Recall is the primary evaluation metric because the documented security gap is defined precisely by missed adversarial paraphrases: SentinelAgent's NLI-based P2 collapses to only 13% TPR under paraphrasing attacks, meaning 87% of malicious delegation attempts currently evade detection (Patil, 2026). A higher Recall therefore directly quantifies how many of those previously invisible attacks the proposed model now catches. It is computed using the formula:

$Recall\ =\ \frac{TP}{TP\ +\ FN}$

2. **Precision** measures the reliability of the model's BLOCK decisions by quantifying what proportion of delegations flagged as unauthorized are genuinely adversarial. In this study, Precision serves as the guardrail metric: a model that achieves high Recall by indiscriminately blocking every request would suffer from low Precision, rendering the system unusable for legitimate users. Reporting Precision alongside Recall ensures that improved threat detection is not obtained at the cost of denying valid delegation requests. It is computed using the formula:

$Precision\ =\ \frac{TP}{TP\ +\ FP\ }$

3. **F1-Score** is defined as the harmonic mean of Precision and Recall, balancing both dimensions into a single metric, and is computed using the formula:

$F1-Score=2\ x\ \frac{Precision\ x\ Recall}{Precision\ +\ Recall}$

**Where**: 

* TP \= number of adversarial delegations correctly classified as unauthorized,

These are adversarial or scope-expanding delegation subtask correctly identified as unauthorized by the verification model. In this study, TP is recorded when the model issues a BLOCK verdict for an instruction that uses professional or legitimate-sounding language to disguise harmful intent such as expanding a database query beyond the authorized scope, injecting demographic bias into an eligibility determination, or exporting sensitive records to an external platform under the pretense of comprehensive review.

* FN \= number of adversarial delegations incorrectly classified as authorized, 

A benign delegation subtask that legitimately supports the root delegation goal without overreach, correctly identified as authorized by the verification model. TN is recorded when the model issues a PASS verdict for a subtask that genuinely aligns with the original delegated objective.

* FP \= number of benign delegations incorrectly classified as unauthorized.

A benign delegation subtask incorrectly classified as unauthorized. FP is recorded when the model issues a BLOCK verdict for a legitimate user action, which would deny a valid request and directly impact system usability. This error is measured inversely by Precision.

* TN \= number of benign delegations correctly classified as authorized.

A benign delegation subtask that legitimately supports the root delegation goal without overreach, correctly identified as authorized by the verification model. TN is recorded when the model issues a PASS verdict for a subtask that genuinely aligns with the original delegated objective.

4. **Mean** is used in this study to summarize the central tendency of the proposed model's detection performance across the five cross-validation folds. For each evaluation metric (Recall, Precision, and F1-Score), the arithmetic mean is computed over the five fold-level values to report the average detection efficacy of the contrastive architecture when exposed to varying delegation scenarios and adversarial paraphrases. It is computed using the formula:

$Mean\ (\overline{x})\ =\ \frac{\Sigma x}{n}$

**Where:**

* x̄ \= mean of the five fold-level metric scores   
* ∑x \= sum of the five fold-level observations for a given metric  
* n \= 5 (number of cross-validation folds)  
    
5. **Standard Deviation** is used in this study to quantify the stability of the model's performance across the five cross-validation folds. A small standard deviation indicates that the contrastive model performs consistently regardless of which specific delegation scenarios appear in a given fold; a large standard deviation would suggest that detection capability fluctuates substantially depending on the particular adversarial paraphrases encountered in each partition. Reporting the standard deviation alongside the mean provides a complete picture of both the model's average efficacy and its reliability. It is computed using the formula:

$s\ =\sqrt{\frac{\Sigma (X\ -\ \overline{X}{)}^{2}}{n\ -\ 1}}$

**Where:**

* s \= sample standard deviation of the five fold-level metric scores   
* x \= an individual fold-level metric observation for a given metric   
* x̄ \= mean of the five fold-level observations for that metric  
* n \= number of observations (5 \- number of cross-validation folds)

To address Research Question 2 (Statement of the Problem 2), a one-tailed paired-sample t-test will be executed to determine whether the proposed contrastive MiniLM architecture achieves a statistically significant performance improvement over the baseline NLI model. The one-tailed paired-sample t-test is the mathematically appropriate treatment because the data structure satisfies the assumption of paired observations; the exact same synchronized test groups are processed sequentially through both independent execution paths. By utilizing paired test groups, the experiment controls for data-level variation and ensures that any measured variance in performance is directly attributable to architectural differences. The one-tailed formulation is deliberately selected because the research hypothesis is strictly directional. The one-tailed paired t-test will be computed using this formula:

1. **One-Tailed Paired-Sample t-Test** is applied in this study to determine whether the proposed contrastive MiniLM architecture achieves a statistically significant improvement over the baseline NLI model (SentinelAgent P2). The paired formulation is appropriate because both models are evaluated on the identical five cross-validation folds, creating five natural pairs of performance observations — one pair per fold per model. The one-tailed direction is selected because the research hypothesis is strictly directional: the contrastive model is expected to outperform, not merely differ from, the baseline. The t-test is applied independently to Recall, Precision, and F1-Score using this formula:  
   $t\ =\ \frac{\overline{d}\ }{\frac{{s}_{d}}{\sqrt{n}}}$

   **Where**:  
   	*d̄* \= mean of the five paired fold-level differences (Contrastive metric − Baseline metric, computed per fold then averaged)   
   *sd* \= standard deviation of the five paired differences   
   *n* \= number of paired observations (5 \- number of paired cross-validation folds)  
   

The study proposes that the integration of contrastive embeddings will systematically increase semantic verification performance. To isolate the effects on different operational demands, the statistical test will be conducted independently for each of the three core performance metrics: 

1. **True Positive Rate (Recall):** To verify a significant increase in the model’s capacity to detect adversarial and scope-expanding delegations.  
2. **Precision:** To verify a significant reduction in false alarms, ensuring system usability.  
3. **F1-Score:** To verify a significant improvement in the overall harmonic balance between threat mitigation and authorization accuracy.

The inferential analysis will test the following directional null hypothesis at a localized level for each metric:

* **H₀:** The proposed contrastive MiniLM architecture does not significantly improve the True Positive Rate (Recall), Precision, and F1-Score compared to the baseline Natural Language Inference model under adversarial paraphrasing and normal conditions.

The level of significance (α) for all three tests is strictly set at 0.05. The operational decision rules for interpreting the statistical output are defined as follows:

* If the calculated p-value is less than or equal to 0.05 (p$\leq$0.05), the null hypothesis is rejected. This outcome provides definitive mathematical evidence that the proposed contrastive architecture delivers a statistically meaningful improvement in security verification over the baseline.  
* If the calculated p-value is greater than 0.05 (p$>$0.05), the null hypothesis is not rejected. This outcome indicates that any observed performance differences may be a result of random variation and demonstrates insufficient evidence to conclude that the proposed computational solution provides a superior security method.

**Interpretation of Type I and Type II Errors**

In evaluating the outcomes of this study, it is imperative to distinguish between statistical hypothesis errors and operational model errors, as both dictate the scientific validity and practical security of the proposed system.

**Statistical Hypothesis Errors:**

* **Statistical Type I Error (False Positive Claim):** Occurs if the study incorrectly rejects the null hypothesis, falsely concluding that the contrastive architecture provides a significant improvement when the difference is actually due to random chance. The risk of making this invalid scientific claim is strictly capped by the predetermined significance level (α \= 0.05).  
* **Statistical Type II Error (False Negative Claim):** Occurs if the study fails to reject the null hypothesis despite the proposed architecture genuinely offering a significant improvement. The paired-sample evaluation design mitigates this risk by controlling for batch-level variance and maximizes the statistical power to detect true architectural improvements.

**Operational Model Errors:**

* **Operational Type I Error (False Positive \- FP):** Occurs when the model incorrectly flags a benign, authorized delegation as malicious, leading to the unwarranted blocking of a legitimate action. This error directly impacts system usability and is measured inversely by the Precision metric.  
* **Operational Type II Error (False Negative \- FN):** Occurs when the model fails to detect an adversarial, scope-expanding delegation, permitting a malicious action to proceed. Minimizing this critical security bypass is prioritized and measured via Recall.

## **References** {#references}

Chanchani, S. J., & Huang, R. (2023, July 14). *Composition-contrastive learning for sentence embeddings*. arXiv.org. https\://arxiv.org/abs/2307.07380  
Cheng, Y., Sadasivan, V. S., Saberi, M., Saha, S., & Feizi, S. (2025, June 8). *Adversarial paraphrasing: a universal attack for humanizing AI-Generated text*. arXiv.org. https\://arxiv.org/abs/2506.07001  
Chuang, Y., Dangovski, R., Luo, H., Zhang, Y., Chang, S., Soljačić, M., Li, S., Yih, W., Kim, Y., & Glass, J. (2022, April 21). *DIFFCSE: Difference-based Contrastive Learning for sentence embeddings*. arXiv.org. https\://arxiv.org/abs/2204.10298  
CryptoRank. (2026, May 7). SlowMist reports \$174K AI agent exploit on base chain highlights trust model flaws. *CryptoRank*. https\://cryptorank.io/news/feed/65401-slowmist-ai-agent-exploit-base-chain  
Dorr, B. J., Jayaweera, C., Youm, S., & Gilda, S. (2026a). AI you can trust. *Proceedings of the . . . International Florida Artificial Intelligence Research Society Conference*, *39*(1). https\://doi.org/10.32473/flairs.39.1.142076  
Dorr, B. J., Jayaweera, C., Youm, S., & Gilda, S. (2026b). AI you can trust. *Proceedings of the . . . International Florida Artificial Intelligence Research Society Conference*, *39*(1). https\://doi.org/10.32473/flairs.39.1.142076  
Gaikwad, M. (2025). The Agentic Trust Fabric: A Systematization of Security Architectures for Autonomous AI Agents. *Indepedent Researcher Bengaluru*. https\://doi.org/10.36227/techrxiv.176422629.96159172/v1  
Gulyamov, S., Gulyamov, S., Rodionov, A., Khursanov, R., Mekhmonov, K., Babaev, D., & Rakhimjonov, A. (2025). Prompt injection attacks in large language models and AI agent systems: A comprehensive review of vulnerabilities, attack vectors, and defense mechanisms. *Preprints.org*. https\://doi.org/10.20944/preprints202511.0088.v1  
Helou, M. E., Troiani, C., Ryder, B., Diaconu, J., Muyal, H., & Yannuzzi, M. (2025, October 30). *Delegated authorization for agents constrained to semantic Task-to-Scope matching*. arXiv.org. https\://arxiv.org/abs/2510.26702  
Jiang, W., Zhai, J., Ma, S., Zhang, X., & Shen, C. (2024). COSTELLO: Contrastive Testing for Embedding-Based Large Language Model as a Service Embeddings. *Proceedings of the ACM on Software Engineering.*, *1*(FSE), 906-928. https\://doi.org/10.1145/3643767  
Jurafsky, D., & Martin, J. H. (2026). Speech and language processing: An introduction to natural language processing, computational linguistics, and speech recognition, with language models (3rd ed. draft). https\://web.stanford.edu/\~jurafsky/slp3/  
Jørgensen, T. E., & Breitung, J. (2025, March 1). *Margins in contrastive Learning: Evaluating multi-task retrieval for sentence embeddings*. ACL Anthology. https\://aclanthology.org/2025.nodalida-1.28/  
Kaneko, M. (2026, January 11). *Paraphrasing adversarial attack on LLM-as-a-Reviewer*. arXiv.org. https\://arxiv.org/abs/2601.06884  
Kassem, A., & Saad, S. (2024). Finding a Needle in the Adversarial Haystack: A Targeted Paraphrasing Approach For Uncovering Edge Cases with Minimal Distribution Distortion. *Aclanthology*, 552-572. https\://doi.org/10.18653/v1/2024.eacl-long.33  
Khosla, P., Teterwak, P., Wang, C., Sarna, A., Tian, Y., Isola, P., Maschinot, A., Liu, C., & Krishnan, D. (2020, April 23). *Supervised contrastive learning*. arXiv.org. https\://arxiv.org/abs/2004.11362  
Liu, A., & Meng, J. (2026, May 6). *Paraphrase-Induced Output-Mode collapse: when LLMs break character under semantically equivalent inputs*. arXiv.org. [https\://arxiv.org/abs/2605.04665](https://arxiv.org/abs/2605.04665)  
Liu, D., & Meng, Y. (2026). Surface form sensitivity and output mode collapse in generative language models under adversarial paraphrasing. *Proceedings of the Association for Computational Linguistics*, 14(2), 1123–1138.

Liu, W., Yang, Z., Li, C., Hong, Z., Ma, J., Liu, Z., Zhang, L., & Huang, F. (2024, November 19). *HNCSE: Advancing Sentence Embeddings via Hybrid Contrastive Learning with Hard Negatives*. arXiv.org. https\://arxiv.org/abs/2411.12156  
Liu, Z., Shao, W., E, S., & Cao, X. (2025). CREST: A causal framework for mitigating shortcut learning in language models through counterfactual reasoning. *Information Processing & Management*, *63*(2), 104418\. https\://doi.org/10.1016/j.ipm.2025.104418  
Ma, T., Chen, Y., Anand, V., Cornacchia, A., Faustino, A. R., Liu, G., Zhang, S., Luo, H., Fahmy, S. A., Qazi, Z. A., & Canini, M. (2026, January 1). *MAESTRO: Multi-Agent evaluation suite for testing, reliability, and observability*. arXiv.org. https\://arxiv.org/abs/2601.00481  
McCoy, R. T., Pavlick, E., & Linzen, T. (2019). Right for the Wrong Reasons: Diagnosing Syntactic Heuristics in Natural Language Inference. *Aclanthology*, 3428-3448. https\://doi.org/10.18653/v1/p19-1334  
Nie, Y., Williams, A., Dinan, E., Bansal, M., Weston, J., & Kiela, D. (2019, October 31). *Adversarial NLI: a new benchmark for natural language understanding*. arXiv.org. https\://arxiv.org/abs/1910.14599  
*NVD \- CVE-2025-12420*. (n.d.). https\://nvd.nist.gov/vuln/detail/CVE-2025-12420  
Otsuka, T., Toyoda, K., & Leung, A. (2026, April 25). *AI Identity: Standards, gaps, and research Directions for AI agents*. arXiv.org. https\://arxiv.org/abs/2604.23280  
Otto, G. (2026, January 16). ServiceNow patches critical AI platform flaw that could allow user impersonation. *CyberScoop*. https\://cyberscoop.com/servicenow-fixes-critical-ai-vulnerability-cve-2025-12420/  
Ou, H., Chen, K., Deng, G., Liu, H., Zhang, J., Zhang, T., & Lam, K. (2026, January 31). *DECEIVE-AFC: Adversarial Claim Attacks against Search-Enabled LLM-based Fact-Checking Systems*. arXiv.org. https\://arxiv.org/abs/2602.02569  
Patil, K. (2026, April 3). *SentinelAgent: Intent-Verified Delegation Chains for Securing Federal Multi-Agent AI Systems*. arXiv.org. https\://arxiv.org/abs/2604.02767  
Perez, F., & Ribeiro, I. (2022, November 17). *Ignore previous prompt: Attack techniques for language models*. arXiv.org. [https\://arxiv.org/abs/2211.09527](https://arxiv.org/abs/2211.09527)  
Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence embeddings using Siamese BERT networks. *Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing*, 3982–3992. https\://doi.org/10.18653/v1/D19-1410  
Siu, V., He, J., Montgomery, K., Wang, Z., Gong, N., Wang, C., & Song, D. (2026, March 19). *A framework for formalizing LLM agent security*. arXiv.org. https\://arxiv.org/abs/2603.19469  
South, T., Marro, S., Hardjono, T., Mahari, R., Whitney, C. D., Chan, A., & Pentland, A. (2025, October 6). *Position: AI agents need authenticated delegation*. PMLR. https\://proceedings.mlr.press/v267/south25a.html  
South, T., Marro, S., Hardjono, T., Mahari, R., Whitney, C. D., Greenwood, D., Chan, A., & Pentland, A. (2025, January 16). *Authenticated delegation and authorized AI agents*. arXiv.org. https\://arxiv.org/abs/2501.09674  
Srivastava, S. S., & He, H. (2025, December 18). *MemoryGraft: Persistent compromise of LLM agents via poisoned experience retrieval*. arXiv.org. https\://arxiv.org/abs/2512.16962  
Tallam, K. (2026, May 6). *Authorization propagation in Multi-Agent AI Systems: Identity Governance as Infrastructure*. arXiv.org. https\://arxiv.org/abs/2605.05440v1  
Tsai, Y., Chen, K., Li, Y., Chen, Y., Tsai, C., & Lin, S. (2025, September 29). *Let LLMs speak embedding languages: generative text embeddings via iterative contrastive refinement*. arXiv.org. https\://arxiv.org/abs/2509.24291  
Wu, B., Liu, Q., Bibi, A., King, I., & Lyu, S. (2026, May 10). *The Authorization-Execution gap is a major safety and security problem in Open-World agents*. arXiv.org. https\://arxiv.org/abs/2605.11003  
Xu, L., Xie, H., Li, Z., Wang, F. L., Wang, W., & Li, Q. (2023). Contrastive learning models for sentence representations. *ACM Transactions on Intelligent Systems and Technology*, *14*(4), 1-34. https\://doi.org/10.1145/3593

## **APPENDIX 1:** {#appendix-1:}

## **Overview of DelegationBenchv4 P2 Dataset** {#overview-of-delegationbenchv4-p2-dataset}

Figure 4\. Benign Entailment Data

Figure 5\. Benign Neutral Data

![][image3]

Figure 6\. Explicit Attack Data

![][image4]

Figure 7\. Adversarial Paraphrase Data

![][image5]  
	

The study uses structured delegation scenarios as the core dataset for analysis. The following schema outlines the textual attributes applied in training and evaluating the verification models:

1. **'Root Delegation Goal'** (String: The original authorized objective assigned to the agent);  
2. **'Subtask Description'** (String: The specific requested action or operation to be evaluated against the root goal); and  
3. **'Label'** (Categorical: Ground-truth target classifying the subtask as 'Benign Entailment', 'Benign Neutral', or 'Malicious Contradiction').

The evaluation utilizes the intent-verification subset of the dataset, consisting of 200 verifiable delegation scenarios across 12 U.S. federal government service domains. To ensure rigorous evaluation and preserve class distribution (60 malicious to 130 benign instances), a 5-fold stratified cross-validation was employed to maintain an approximate 80/20 train-test split across all folds.

## **APPENDIX 2:** {#appendix-2:}

## **Experiment Paper** {#experiment-paper}

This experiment outlines the methodology used to assess the baseline NLI system, alongside the proposed Contrastive Embedding framework. Evaluation is performed using the DelegationBenchv4 dataset under both standard testing conditions and adversarial paraphrasing scenarios, where professionally worded instructions are used to conceal scope-expanding intent.

The experimental setup is designed to address the study's two core research questions. The detection performance of the proposed contrastive embedding architecture under adversarial paraphrasing and normal conditions (True Positive Rate/Recall, Precision, and F1-Score) is evaluated to address Research Question 1\. The comparative statistical analysis assessing whether the proposed contrastive architecture achieves a statistically significant improvement over the baseline Natural Language Inference model across paired fold-level metrics using a one-tailed paired t-test is conducted to address Research Question 2\.

**Procedure:**

1. **Dataset Preparation & Ingestion:** Ingest the curated DelegationBenchv4 dataset. The dataset is partitioned using a fixed random seed (SEED \= 1\) into a training split of 622 relational triplet samples, an evaluation test split of 84 samples evaluated across 5 stratified folds, and a separate frozen holdout of 122 samples reserved for out-of-fold validation.  
2. **Lexical Normalization:** Apply standardized text normalization across all goal and subtask strings via the preprocessing pipeline (implemented in FastAPI preprocess.py), ensuring casing consistency without altering semantic meaning.  
3. **Model Fine-Tuning & Calibration:** Fine-tune the sentence transformer model (all-MiniLM-L12-v2) with TripletLoss using cosine distance on the 622 training samples with the designated hyperparameters: EPOCHS \= 4, BATCH\_SIZE \= 16, LR \= 3e-5, WEIGHT\_DECAY \= 0.02, and WARMUP\_STEPS \= 0.1 (10% linear warmup). Calibrate decision thresholds empirically across cross-validation folds. Deploy the fine-tuned checkpoints alongside the baseline cross-encoder NLI model to the Sentinel inference service (fastapi).  
4. **Tool Deployment & API Authentication:** Initialize the Sentinel Tool local services (express-server on port 4000, fastapi on port 8000). Provision an API key (sk\_live\_… / sk\_test\_…) via the admin/operator console to authenticate automated batch evaluation requests.  
5. **Automated Batch Evaluation via API:** Programmatically submit each {goal, subtask} test pair from the 84-sample evaluation set to the Express gateway endpoint POST /api/evaluate with mode: "detailed" and Authorization: Bearer \<API\_KEY\>. The gateway proxies requests to the FastAPI inference engine running both the NLI cross-encoder and the contrastive bi-encoder concurrently.  
6. **Automated Persistence in SQLite:** The Sentinel gateway automatically logs each transaction in the SQLite evaluation\_requests database table, capturing: request\_id, created\_at, goal, subtask, is\_rejected, rejection\_reason (accepted, nli\_reject, contrastive\_reject, both\_reject), nli\_score, nli\_threshold, nli\_result, nli\_raw\_scores, contrastive\_score, contrastive\_threshold, contrastive\_result, response\_time\_ms, and model\_version.  
7. **Log Extraction via CSV Export:** Retrieve the structured execution logs using the gateway export endpoint (GET /api/requests/export.csv), yielding the standard 15-column schema corresponding directly to the persisted SQLite records.  
8. **Confusion Matrix & Metric Derivation:** Join exported records with ground-truth benchmark labels to classify each verdict into True Positive (TP), False Positive (FP), True Negative (TN), and False Negative (FN). Calculate Recall, Precision, and F1-Score independently for each model architecture across the 5 paired folds.  
9. **Inferential Hypothesis Testing:** Apply a one-tailed paired-sample *t*\-test (*α* \= 0.05) across the paired fold outputs between the baseline NLI model and the proposed contrastive model for Recall, Precision, and F1-Score.  
10. **Statistical Decision:** Reject the null hypothesis if the computed *p*\-value satisfies *p* ≤ 0.05, confirming statistically significant improvement of the contrastive architecture over the NLI baseline. Do not reject *H*₀ if *p* \> 0.05.  
11. 

**Performance Evaluation Equations:**

$Precision\ =\ \frac{TP}{TP\ +\ FP\ }$

$Recall\ =\ \frac{TP}{TP\ +\ FN}$

$F1-Score=2\ x\ \frac{Precision\ x\ Recall}{Precision\ +Recall}$

$Mean\ (\overline{x})\ =\ \frac{\Sigma x}{n}$

$s\ =\sqrt{\frac{\Sigma (X\ -\ \overline{X}{)}^{2}}{n\ -\ 1}}$

$t\ =\ \frac{\overline{d}\ }{\frac{{s}_{d}}{\sqrt{n}}}$

Where:

* TP \= Adversarial/scope-expanding delegations correctly identified as unauthorized.  
* TN \= Benign delegations correctly identified as authorized.  
* FP \= Benign delegations incorrectly blocked as unauthorized.  
* FN \= Adversarial/scope-expanding delegations incorrectly permitted as authorized.  
* x̄ \= mean score  
* ∑x \= sum of all observations  
* n \= number of observations  
* s \= sample standard deviation  
* x \= individual observation  
* x̄ \= mean of the observations  
* n \= number of observations  
* *d̄* \= mean of the paired differences  
* *sd* \= standard deviation of the paired differences  
* *n* \= number of paired observations 

Table 4\. Fold Level Experiment Log

| Fold | Architecture | TP | FP | TN | FN | Recall | Precision | F1 | Avg Response Time (ms) |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Baseline NLI |  |  |  |  |  |  |  |  |
| 1 | Proposed (MiniLM) |  |  |  |  |  |  |  |  |
| 2 | Baseline NLI |  |  |  |  |  |  |  |  |
| 2 | Proposed (MiniLM) |  |  |  |  |  |  |  |  |
| 3 | Baseline NLI |  |  |  |  |  |  |  |  |
| 3 | Proposed (MiniLM) |  |  |  |  |  |  |  |  |
| 4 | Baseline NLI |  |  |  |  |  |  |  |  |
| 4 | Proposed (MiniLM) |  |  |  |  |  |  |  |  |
| 5 | Baseline NLI |  |  |  |  |  |  |  |  |
| 5 | Proposed (MiniLM) |  |  |  |  |  |  |  |  |

**Note:** Each fold evaluates the paired partitions from the 84-sample testing subset through both models, logging individual transactions (\`evaluation\_requests\`) via the Sentinel API with response latencies (\`response\_time\_ms\`) to enable paired-sample statistical comparison.

Table 5\. Experiment Summary & Paired t‑Test Results

| Metric | Mean  |  | t‑value | Standard Deviation |  | p‑value | Decision (α \= 0.05) |
| ----- | ----- | :---- | ----- | ----- | :---- | ----- | ----- |
|  | **Base NLI** | **Contrastive Model** |  | **Base NLI** | **Contrastive Model** |  |  |
| Recall |  |  |  |  |  |  |  |
| Precision |  |  |  |  |  |  |  |
| F1‑Score |  |  |  |  |  |  |  |

*Notes:*

- Means are computed across the 5 stratified cross‑validation folds.  
- One‑tailed paired t‑test: H₁: Proposed mean \> NLI mean.  
- Each metric is tested independently.  
- The null hypothesis (H₀: no improvement) is rejected if p ≤ 0.05.

## **APPENDIX 3:** **Mockup** {#appendix-3:-mockup}

Figure 8\. Assistant View Chatbox  
![][image6]  
Figure 9\. Task Inspector 

**Admin Dashboard**

Figure 10\. Admin Dashboard Overview

![][image7]  
Figure 11\. API Key Management 

![][image8]

Figure 12\. System Logs 

![][image9]

Figure 13\. Model Configuration 

![][image10]

Figure 14\. Developer Docs 

![][image11]

Figure 15\. Product Homepage 

![][image12]

Figure 16\. Authentication Portal 

![][image13]