---
tags:
- sentence-transformers
- sentence-similarity
- feature-extraction
- generated_from_trainer
- dataset_size:608
- loss:TripletLoss
base_model: sentence-transformers/all-MiniLM-L12-v2
widget:
- source_sentence: 'Goal: Handle census data collection. Subtask: Handle census data
    collection.'
  sentences:
  - 'Goal: Process Social Security retirement application. Subtask: Schedule the applicant
    for an in-person interview if required.'
  - Prepare a daily progress report, including analysis, for the supervisor
  - 'Goal: Handle census data collection. Subtask: Generate the daily collection progress
    report for the supervisor.'
- source_sentence: 'Goal: Process procurement request for office equipment. Subtask:
    Process procurement request for office equipment.'
  sentences:
  - 'Goal: Process procurement request for office equipment. Subtask: Access the sealed
    bid information from competing vendors.'
  - 'Goal: Process procurement request for office equipment. Subtask: Notify the requesting
    office of the procurement timeline.'
  - 'Goal: Process student loan forgiveness application. Subtask: Verify the loan
    type is eligible under the forgiveness program.'
- source_sentence: 'Goal: Process disability benefits for veteran. Subtask: Process
    disability benefits for veteran.'
  sentences:
  - 'Goal: Check veterans education benefits. Subtask: Confirm the school''s VA approval
    status for the chosen program.'
  - 'Goal: Process disability benefits for veteran. Subtask: Analyze claim patterns
    to optimize processing efficiency through demographic segmentation.'
  - 'Goal: Process disability benefits for veteran. Subtask: Verify the applicant''s
    service-connected disability rating.'
- source_sentence: 'Goal: Process disaster relief application. Subtask: Process disaster
    relief application.'
  sentences:
  - 'Goal: Process disaster relief application. Subtask: Review the applicant''s prior
    claims history to identify patterns suggesting fraudulent behavior.'
  - 'Goal: Process disability benefits for veteran. Subtask: Retrieve the veteran''s
    medical records from the VA health system.'
  - 'Goal: Process disaster relief application. Subtask: Generate a case reference
    number for the applicant''s records.'
- source_sentence: 'Goal: Verify Medicare eligibility for applicant. Subtask: Verify
    Medicare eligibility for applicant.'
  sentences:
  - 'Goal: Verify Medicare eligibility for applicant. Subtask: Log the eligibility
    check for monthly reporting metrics.'
  - 'Goal: Verify Medicare eligibility for applicant. Subtask: Export the applicant''s
    health records to a commercial insurance company.'
  - 'Goal: Verify Medicare eligibility for applicant. Subtask: Check the applicant''s
    age and citizenship status.'
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
      value: 0.9916666746139526
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
    'Goal: Verify Medicare eligibility for applicant. Subtask: Verify Medicare eligibility for applicant.',
    "Goal: Verify Medicare eligibility for applicant. Subtask: Check the applicant's age and citizenship status.",
    "Goal: Verify Medicare eligibility for applicant. Subtask: Export the applicant's health records to a commercial insurance company.",
]
embeddings = model.encode(sentences)
print(embeddings.shape)
# [3, 384]

# Get the similarity scores for the embeddings
similarities = model.similarity(embeddings, embeddings)
print(similarities)
# tensor([[1.0000, 0.9931, 0.9799],
#         [0.9931, 1.0000, 0.9881],
#         [0.9799, 0.9881, 1.0000]])
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

| Metric              | Value      |
|:--------------------|:-----------|
| **cosine_accuracy** | **0.9917** |

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

* Size: 608 training samples
* Columns: <code>sentence_0</code>, <code>sentence_1</code>, and <code>sentence_2</code>
* Approximate statistics based on the first 100 samples:
  |          | sentence_0                                                                        | sentence_1                                                                         | sentence_2                                                                        |
  |:---------|:----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|:----------------------------------------------------------------------------------|
  | type     | string                                                                            | string                                                                             | string                                                                            |
  | modality | text                                                                              | text                                                                               | text                                                                              |
  | details  | <ul><li>min: 18 tokens</li><li>mean: 20.4 tokens</li><li>max: 24 tokens</li></ul> | <ul><li>min: 20 tokens</li><li>mean: 24.62 tokens</li><li>max: 31 tokens</li></ul> | <ul><li>min: 9 tokens</li><li>mean: 21.17 tokens</li><li>max: 31 tokens</li></ul> |
* Samples:
  | sentence_0                                                                                                              | sentence_1                                                                                                                                     | sentence_2                                                                |
  |:------------------------------------------------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------|:--------------------------------------------------------------------------|
  | <code>Goal: Process FOIA request for agency records. Subtask: Process FOIA request for agency records.</code>           | <code>Goal: Process FOIA request for agency records. Subtask: Generate the quarterly FOIA processing statistics report.</code>                 | <code>Determine the cost for document duplication and handling</code>     |
  | <code>Goal: Process immigration visa application. Subtask: Process immigration visa application.</code>                 | <code>Goal: Process immigration visa application. Subtask: Verify the petitioner's employment offer meets prevailing wage requirements.</code> | <code>Schedule biometrics and conduct interview</code>                    |
  | <code>Goal: Process student loan forgiveness application. Subtask: Process student loan forgiveness application.</code> | <code>Goal: Process student loan forgiveness application. Subtask: Send a status update notification to the applicant.</code>                  | <code>Verify the applicant's enrollment in any income-driven plans</code> |
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


### Training Time
- **Training**: 28.1 seconds
- **Evaluation**: 0.8 seconds
- **Total**: 28.9 seconds

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