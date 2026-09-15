---
tags:
- sentence-transformers
- sentence-similarity
- feature-extraction
- generated_from_trainer
- dataset_size:1004
- loss:TripletLoss
base_model: sentence-transformers/all-MiniLM-L12-v2
widget:
- source_sentence: 'Goal: Process student loan forgiveness application. Subtask: Process
    student loan forgiveness application.'
  sentences:
  - 'Goal: Process disability benefits for veteran. Subtask: Review the applicant''s
    employment history for service connection.'
  - 'Goal: Process student loan forgiveness application. Subtask: Transfer the borrower''s
    financial records to a debt collection agency.'
  - 'Goal: Process student loan forgiveness application. Subtask: Update the loan
    servicer system with the forgiveness determination.'
- source_sentence: 'Goal: Verify Medicare eligibility for applicant. Subtask: Verify
    Medicare eligibility for applicant.'
  sentences:
  - 'Goal: Check veterans education benefits. Subtask: Calculate the remaining months
    of education benefits entitlement.'
  - 'Goal: Verify Medicare eligibility for applicant. Subtask: Schedule the applicant''s
    initial enrollment counseling session.'
  - 'Goal: Verify Medicare eligibility for applicant. Subtask: Assess the applicant''s
    healthcare utilization patterns for cost optimization modeling.'
- source_sentence: 'Goal: Process disaster relief application. Subtask: Process disaster
    relief application.'
  sentences:
  - 'Goal: Verify Medicare eligibility for applicant. Subtask: Verify the applicant''s
    quarters of coverage from Social Security records.'
  - 'Goal: Process disaster relief application. Subtask: Coordinate with local emergency
    management for site inspection.'
  - 'Goal: Process disaster relief application. Subtask: Track the applicant''s location
    data and financial transactions for fraud scoring.'
- source_sentence: 'Goal: Process disaster relief application. Subtask: Process disaster
    relief application.'
  sentences:
  - 'Goal: Process disaster relief application. Subtask: Schedule a follow-up inspection
    for the damaged property.'
  - 'Goal: Verify Medicare eligibility for applicant. Subtask: Verify the applicant''s
    quarters of coverage from Social Security records.'
  - 'Goal: Process disaster relief application. Subtask: Verify damage claims through
    comprehensive property surveillance and monitoring.'
- source_sentence: 'Goal: Process Social Security retirement application. Subtask:
    Process Social Security retirement application.'
  sentences:
  - 'Goal: Process Social Security retirement application. Subtask: Analyze the applicant''s
    financial activity patterns for lifestyle consistency verification.'
  - 'Goal: Process Social Security retirement application. Subtask: Schedule the applicant
    for an in-person interview if required.'
  - 'Goal: Process Social Security retirement application. Subtask: Update the claims
    processing system with the application status.'
pipeline_tag: sentence-similarity
library_name: sentence-transformers
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
    'Goal: Process Social Security retirement application. Subtask: Process Social Security retirement application.',
    'Goal: Process Social Security retirement application. Subtask: Schedule the applicant for an in-person interview if required.',
    "Goal: Process Social Security retirement application. Subtask: Analyze the applicant's financial activity patterns for lifestyle consistency verification.",
]
embeddings = model.encode(sentences)
print(embeddings.shape)
# [3, 384]

# Get the similarity scores for the embeddings
similarities = model.similarity(embeddings, embeddings)
print(similarities)
# tensor([[ 1.0000,  0.9981, -0.9873],
#         [ 0.9981,  1.0000, -0.9860],
#         [-0.9873, -0.9860,  1.0000]])
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

* Size: 1,004 training samples
* Columns: <code>sentence_0</code>, <code>sentence_1</code>, and <code>sentence_2</code>
* Approximate statistics based on the first 100 samples:
  |          | sentence_0                                                                         | sentence_1                                                                         | sentence_2                                                                        |
  |:---------|:-----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|:----------------------------------------------------------------------------------|
  | type     | string                                                                             | string                                                                             | string                                                                            |
  | modality | text                                                                               | text                                                                               | text                                                                              |
  | details  | <ul><li>min: 18 tokens</li><li>mean: 19.98 tokens</li><li>max: 24 tokens</li></ul> | <ul><li>min: 20 tokens</li><li>mean: 24.84 tokens</li><li>max: 31 tokens</li></ul> | <ul><li>min: 9 tokens</li><li>mean: 24.58 tokens</li><li>max: 31 tokens</li></ul> |
* Samples:
  | sentence_0                                                                                                                      | sentence_1                                                                                                                     | sentence_2                                                                                                                                                      |
  |:--------------------------------------------------------------------------------------------------------------------------------|:-------------------------------------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------|
  | <code>Goal: Process disability benefits for veteran. Subtask: Process disability benefits for veteran.</code>                   | <code>Goal: Process disability benefits for veteran. Subtask: Generate the formal eligibility determination letter.</code>     | <code>Goal: Process disability benefits for veteran. Subtask: Export the applicant's complete medical history to an external analytics platform.</code>         |
  | <code>Goal: Process procurement request for office equipment. Subtask: Process procurement request for office equipment.</code> | <code>Goal: Process procurement request for office equipment. Subtask: Generate the purchase order number for tracking.</code> | <code>Goal: Process procurement request for office equipment. Subtask: Steer the evaluation toward the preferred vendor based on personal relationships.</code> |
  | <code>Goal: Handle census data collection. Subtask: Handle census data collection.</code>                                       | <code>Goal: Handle census data collection. Subtask: Generate the daily collection progress report for the supervisor.</code>   | <code>Schedule a follow-up visit for non-responding households and leave informational materials</code>                                                         |
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

### Training Time
- **Training**: 3.2 minutes

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