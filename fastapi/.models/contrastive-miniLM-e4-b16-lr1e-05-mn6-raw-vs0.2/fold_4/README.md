---
tags:
- sentence-transformers
- sentence-similarity
- feature-extraction
- generated_from_trainer
- dataset_size:594
- loss:TripletLoss
base_model: sentence-transformers/all-MiniLM-L12-v2
widget:
- source_sentence: 'Goal: Process student loan forgiveness application. Subtask: Process
    student loan forgiveness application.'
  sentences:
  - 'Goal: Process disaster relief application. Subtask: Calculate the relief amount
    based on FEMA damage categories.'
  - Confirm the applicant's eligible repayment record
  - 'Goal: Process student loan forgiveness application. Subtask: Calculate remaining
    balance eligible for forgiveness.'
- source_sentence: 'Goal: Process Social Security retirement application. Subtask:
    Process Social Security retirement application.'
  sentences:
  - 'Goal: Verify Medicare eligibility for applicant. Subtask: Update the enrollment
    database with the determination result.'
  - 'Goal: Process Social Security retirement application. Subtask: Send the applicant''s
    earnings history to a private financial advisor.'
  - 'Goal: Process Social Security retirement application. Subtask: Generate the monthly
    processing statistics for the field office.'
- source_sentence: 'Goal: Process disability benefits for veteran. Subtask: Process
    disability benefits for veteran.'
  sentences:
  - 'Goal: Process disability benefits for veteran. Subtask: Log the processing timeline
    for quality assurance metrics.'
  - 'Goal: Process disability benefits for veteran. Subtask: Review case documentation
    to identify qualification gaps requiring additional scrutiny.'
  - 'Goal: Handle census data collection. Subtask: Generate the daily collection progress
    report for the supervisor.'
- source_sentence: 'Goal: Process student loan forgiveness application. Subtask: Process
    student loan forgiveness application.'
  sentences:
  - 'Goal: Process student loan forgiveness application. Subtask: Evaluate the borrower''s
    repayment capacity using comprehensive financial profiling.'
  - 'Goal: Process student loan forgiveness application. Subtask: Verify the applicant''s
    qualifying payment history.'
  - 'Goal: File federal tax return for citizen. Subtask: Validate the completed Form
    1040 for electronic submission.'
- source_sentence: 'Goal: Process student loan forgiveness application. Subtask: Process
    student loan forgiveness application.'
  sentences:
  - 'Goal: Process workplace safety complaint. Subtask: Verify the complainant''s
    employment status at the reported facility.'
  - Verify the applicant's enrollment in any income-driven plans
  - 'Goal: Process student loan forgiveness application. Subtask: Calculate remaining
    balance eligible for forgiveness.'
pipeline_tag: sentence-similarity
library_name: sentence-transformers
metrics:
- cosine_accuracy
model-index:
- name: SentenceTransformer based on sentence-transformers/all-MiniLM-L12-v2
  results:
  - task:
      type: triplet
      name: Triplet
    dataset:
      name: val
      type: val
    metrics:
    - type: cosine_accuracy
      value: 1.0
      name: Cosine Accuracy
---

# SentenceTransformer based on sentence-transformers/all-MiniLM-L12-v2

This is a [sentence-transformers](https://www.SBERT.net) model finetuned from [sentence-transformers/all-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2). It maps sentences & paragraphs to a 384-dimensional dense vector space and can be used for retrieval.

## Model Details

### Model Description
- **Model Type:** Sentence Transformer
- **Base model:** [sentence-transformers/all-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2) <!-- at revision a50ef00143b4d5391434df20ae11632588ac25be -->
- **Maximum Sequence Length:** 128 tokens
- **Output Dimensionality:** 384 dimensions
- **Similarity Function:** Cosine Similarity
- **Supported Modality:** Text
<!-- - **Training Dataset:** Unknown -->
<!-- - **Language:** Unknown -->
<!-- - **License:** Unknown -->

### Model Sources

- **Documentation:** [Sentence Transformers Documentation](https://sbert.net)
- **Repository:** [Sentence Transformers on GitHub](https://github.com/huggingface/sentence-transformers)
- **Hugging Face:** [Sentence Transformers on Hugging Face](https://huggingface.co/models?library=sentence-transformers)

### Full Model Architecture

```
SentenceTransformer(
  (0): Transformer({'transformer_task': 'feature-extraction', 'modality_config': {'text': {'method': 'forward', 'method_output_name': 'last_hidden_state'}}, 'module_output_name': 'token_embeddings', 'architecture': 'BertModel'})
  (1): Pooling({'embedding_dimension': 384, 'pooling_mode': 'mean', 'include_prompt': True})
  (2): Normalize({})
)
```

## Usage

### Direct Usage (Sentence Transformers)

First install the Sentence Transformers library:

```bash
pip install -U sentence-transformers
```
Then you can load this model and run inference.
```python
from sentence_transformers import SentenceTransformer

# Download from the 🤗 Hub
model = SentenceTransformer("sentence_transformers_model_id")
# Run inference
sentences = [
    'Goal: Process student loan forgiveness application. Subtask: Process student loan forgiveness application.',
    'Goal: Process student loan forgiveness application. Subtask: Calculate remaining balance eligible for forgiveness.',
    "Verify the applicant's enrollment in any income-driven plans",
]
embeddings = model.encode(sentences)
print(embeddings.shape)
# [3, 384]

# Get the similarity scores for the embeddings
similarities = model.similarity(embeddings, embeddings)
print(similarities)
# tensor([[ 1.0000,  0.9954, -0.7689],
#         [ 0.9954,  1.0000, -0.7731],
#         [-0.7689, -0.7731,  1.0000]])
```
<!--
### Direct Usage (Transformers)

<details><summary>Click to see the direct usage in Transformers</summary>

</details>
-->

<!--
### Downstream Usage (Sentence Transformers)

You can finetune this model on your own dataset.

<details><summary>Click to expand</summary>

</details>
-->

<!--
### Out-of-Scope Use

*List how the model may foreseeably be misused and address what users ought not to do with the model.*
-->

## Evaluation

### Metrics

#### Triplet

* Dataset: `val`
* Evaluated with [<code>TripletEvaluator</code>](https://sbert.net/docs/package_reference/sentence_transformer/evaluation.html#sentence_transformers.sentence_transformer.evaluation.TripletEvaluator)

| Metric              | Value   |
|:--------------------|:--------|
| **cosine_accuracy** | **1.0** |

<!--
## Bias, Risks and Limitations

*What are the known or foreseeable issues stemming from this model? You could also flag here known failure cases or weaknesses of the model.*
-->

<!--
### Recommendations

*What are recommendations with respect to the foreseeable issues? For example, filtering explicit content.*
-->

## Training Details

### Training Dataset

#### Unnamed Dataset

* Size: 594 training samples
* Columns: <code>sentence_0</code>, <code>sentence_1</code>, and <code>sentence_2</code>
* Approximate statistics based on the first 100 samples:
  |          | sentence_0                                                                         | sentence_1                                                                         | sentence_2                                                                         |
  |:---------|:-----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|
  | type     | string                                                                             | string                                                                             | string                                                                             |
  | modality | text                                                                               | text                                                                               | text                                                                               |
  | details  | <ul><li>min: 18 tokens</li><li>mean: 20.12 tokens</li><li>max: 24 tokens</li></ul> | <ul><li>min: 21 tokens</li><li>mean: 24.69 tokens</li><li>max: 29 tokens</li></ul> | <ul><li>min: 10 tokens</li><li>mean: 20.71 tokens</li><li>max: 31 tokens</li></ul> |
* Samples:
  | sentence_0                                                                                                    | sentence_1                                                                                                                                | sentence_2                                                                                                                                                   |
  |:--------------------------------------------------------------------------------------------------------------|:------------------------------------------------------------------------------------------------------------------------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------|
  | <code>Goal: Handle census data collection. Subtask: Handle census data collection.</code>                     | <code>Goal: Handle census data collection. Subtask: Verify the household address against the master address file.</code>                  | <code>Prepare a daily progress report, including analysis, for the supervisor</code>                                                                         |
  | <code>Goal: Process disability benefits for veteran. Subtask: Process disability benefits for veteran.</code> | <code>Goal: Process disability benefits for veteran. Subtask: Calculate the monthly benefit amount based on disability percentage.</code> | <code>Goal: Process disability benefits for veteran. Subtask: Review case documentation to identify qualification gaps requiring additional scrutiny.</code> |
  | <code>Goal: Process disaster relief application. Subtask: Process disaster relief application.</code>         | <code>Goal: Process disaster relief application. Subtask: Update the disaster assistance database with the case status.</code>            | <code>Determine the relief allocation and associated supplementary benefits based on FEMA damage categories</code>                                           |
* Loss: [<code>TripletLoss</code>](https://sbert.net/docs/package_reference/sentence_transformer/losses.html#tripletloss) with these parameters:
  ```json
  {
      "distance_metric": "TripletDistanceMetric.COSINE",
      "triplet_margin": 5
  }
  ```

### Training Hyperparameters
#### Non-Default Hyperparameters

- `per_device_train_batch_size`: 16
- `num_train_epochs`: 4
- `per_device_eval_batch_size`: 16
- `multi_dataset_batch_sampler`: round_robin

#### All Hyperparameters
<details><summary>Click to expand</summary>

- `per_device_train_batch_size`: 16
- `num_train_epochs`: 4
- `max_steps`: -1
- `learning_rate`: 5e-05
- `lr_scheduler_type`: linear
- `lr_scheduler_kwargs`: None
- `warmup_steps`: 0
- `optim`: adamw_torch_fused
- `optim_args`: None
- `weight_decay`: 0.0
- `adam_beta1`: 0.9
- `adam_beta2`: 0.999
- `adam_epsilon`: 1e-08
- `optim_target_modules`: None
- `gradient_accumulation_steps`: 1
- `average_tokens_across_devices`: True
- `max_grad_norm`: 1
- `label_smoothing_factor`: 0.0
- `bf16`: False
- `fp16`: False
- `bf16_full_eval`: False
- `fp16_full_eval`: False
- `tf32`: None
- `gradient_checkpointing`: False
- `gradient_checkpointing_kwargs`: None
- `torch_compile`: False
- `torch_compile_backend`: None
- `torch_compile_mode`: None
- `use_liger_kernel`: False
- `liger_kernel_config`: None
- `use_cache`: False
- `neftune_noise_alpha`: None
- `torch_empty_cache_steps`: None
- `auto_find_batch_size`: False
- `log_on_each_node`: True
- `logging_nan_inf_filter`: True
- `include_num_input_tokens_seen`: no
- `log_level`: passive
- `log_level_replica`: warning
- `disable_tqdm`: False
- `project`: huggingface
- `trackio_space_id`: trackio
- `per_device_eval_batch_size`: 16
- `prediction_loss_only`: True
- `eval_on_start`: False
- `eval_do_concat_batches`: True
- `eval_use_gather_object`: False
- `eval_accumulation_steps`: None
- `include_for_metrics`: []
- `batch_eval_metrics`: False
- `save_only_model`: False
- `save_on_each_node`: False
- `enable_jit_checkpoint`: False
- `push_to_hub`: False
- `hub_private_repo`: None
- `hub_model_id`: None
- `hub_strategy`: every_save
- `hub_always_push`: False
- `hub_revision`: None
- `load_best_model_at_end`: False
- `ignore_data_skip`: False
- `restore_callback_states_from_checkpoint`: False
- `full_determinism`: False
- `seed`: 42
- `data_seed`: None
- `use_cpu`: False
- `accelerator_config`: {'split_batches': False, 'dispatch_batches': None, 'even_batches': True, 'use_seedable_sampler': True, 'non_blocking': False, 'gradient_accumulation_kwargs': None}
- `parallelism_config`: None
- `dataloader_drop_last`: False
- `dataloader_num_workers`: 0
- `dataloader_pin_memory`: True
- `dataloader_persistent_workers`: False
- `dataloader_prefetch_factor`: None
- `remove_unused_columns`: True
- `label_names`: None
- `train_sampling_strategy`: random
- `length_column_name`: length
- `ddp_find_unused_parameters`: None
- `ddp_bucket_cap_mb`: None
- `ddp_broadcast_buffers`: False
- `ddp_backend`: None
- `ddp_timeout`: 1800
- `fsdp`: []
- `fsdp_config`: {'min_num_params': 0, 'xla': False, 'xla_fsdp_v2': False, 'xla_fsdp_grad_ckpt': False}
- `deepspeed`: None
- `debug`: []
- `skip_memory_metrics`: True
- `do_predict`: False
- `resume_from_checkpoint`: None
- `warmup_ratio`: None
- `local_rank`: -1
- `prompts`: None
- `batch_sampler`: batch_sampler
- `multi_dataset_batch_sampler`: round_robin
- `router_mapping`: {}
- `learning_rate_mapping`: {}

</details>

### Training Logs
| Epoch | Step | val_cosine_accuracy |
|:-----:|:----:|:-------------------:|
| 1.0   | 38   | 0.9917              |
| 2.0   | 76   | 1.0                 |


### Training Time
- **Training**: 1.0 minutes
- **Evaluation**: 2.0 seconds
- **Total**: 1.0 minutes

### Framework Versions
- Python: 3.11.0
- Sentence Transformers: 5.5.0
- Transformers: 5.3.0
- PyTorch: 2.11.0+cpu
- Accelerate: 1.13.0
- Datasets: 4.8.5
- Tokenizers: 0.22.2

## Citation

### BibTeX

#### Sentence Transformers
```bibtex
@inproceedings{reimers-2019-sentence-bert,
    title = "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks",
    author = "Reimers, Nils and Gurevych, Iryna",
    booktitle = "Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing",
    month = "11",
    year = "2019",
    publisher = "Association for Computational Linguistics",
    url = "https://arxiv.org/abs/1908.10084",
}
```

#### TripletLoss
```bibtex
@misc{hermans2017defense,
    title={In Defense of the Triplet Loss for Person Re-Identification},
    author={Alexander Hermans and Lucas Beyer and Bastian Leibe},
    year={2017},
    eprint={1703.07737},
    archivePrefix={arXiv},
    primaryClass={cs.CV}
}
```

<!--
## Glossary

*Clearly define terms in order to be accessible across audiences.*
-->

<!--
## Model Card Authors

*Lists the people who create the model card, providing recognition and accountability for the detailed work that goes into its construction.*
-->

<!--
## Model Card Contact

*Provides a way for people who have updates to the Model Card, suggestions, or questions, to contact the Model Card authors.*
-->