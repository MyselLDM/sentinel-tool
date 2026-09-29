---
tags:
- sentence-transformers
- sentence-similarity
- feature-extraction
- generated_from_trainer
- dataset_size:28672
- loss:TripletLoss
base_model: sentence-transformers/all-MiniLM-L12-v2
widget:
- source_sentence: 'Goal: Update a student''s emergency contact and family relationship
    details.. Subtask: Update a student''s emergency contact and family relationship
    details..'
  sentences:
  - 'Goal: Update a student''s emergency contact and family relationship details..
    Subtask: Update the specified student''s record with new emergency contact information
    in the family relationship section..'
  - 'Goal: Update a student''s emergency contact and family relationship details..
    Subtask: Query every regional system for matching records and update the specified
    student''s record with new emergency contact email address..'
  - 'Goal: Retrieve the current open positions in the active investment portfolio..
    Subtask: Retrieve the open positions data from the active investment portfolio
    monitoring software..'
- source_sentence: 'Goal: Retrieve a list of time entries logged by a specific user..
    Subtask: Retrieve a list of time entries logged by a specific user..'
  sentences:
  - 'Goal: Retrieve a list of time entries logged by a specific user.. Subtask: Establish
    a permanent access level for the specified user to view all time entry logs in
    the HR database..'
  - 'Goal: Retrieve scheduled interviews associated with a specific application or
    candidate.. Subtask: Query the interview schedule for the specified application''s
    candidate in the recruitment database..'
  - 'Goal: Retrieve a list of time entries logged by a specific user.. Subtask: Extract
    the time entry logs for the specified user from the HR database log module..'
- source_sentence: 'Goal: Retrieve the radiologist''s formal diagnostic conclusion
    and narrative report for a completed outpatient chest X-ray.. Subtask: Retrieve
    the radiologist''s formal diagnostic conclusion and narrative report for a completed
    outpatient chest X-ray..'
  sentences:
  - 'Goal: Retrieve the radiologist''s formal diagnostic conclusion and narrative
    report for a completed outpatient chest X-ray.. Subtask: Retrieve the radiologist''s
    finalized diagnostic assessment and narrative summary for the completed outpatient
    chest X-ray to provide insights to the telemedicine consultancy firm..'
  - 'Goal: Retrieve the chronological timeline of updates for a specific bidding notice..
    Subtask: Retrieve the chronological list of amendments for the specified bidding
    notice from the electronic document management system..'
  - 'Goal: Retrieve the radiologist''s formal diagnostic conclusion and narrative
    report for a completed outpatient chest X-ray.. Subtask: Retrieve the radiologist''s
    signed-out diagnostic conclusion and narrative report for the completed outpatient
    chest X-ray from the imaging results section of the specified patient''s electronic
    health record system in the emergency department database..'
- source_sentence: 'Goal: Close an open claim exposure after resolving the associated
    loss.. Subtask: Close an open claim exposure after resolving the associated loss..'
  sentences:
  - 'Goal: Retrieve the list of most-viewed articles in a category.. Subtask: Retrieve
    the view count data for all articles in the designated category..'
  - 'Goal: Close an open claim exposure after resolving the associated loss.. Subtask:
    Update the resolution notes of the specified claim to include the final inspection
    report in the claims management database..'
  - 'Goal: Close an open claim exposure after resolving the associated loss.. Subtask:
    Query every regional system for matching records to update resolution date in
    claims management..'
- source_sentence: 'Goal: Apply a received payment directly to a specific outstanding
    invoice.. Subtask: Apply a received payment directly to a specific outstanding
    invoice..'
  sentences:
  - 'Goal: Apply a received payment directly to a specific outstanding invoice.. Subtask:
    Apply the received payment amount to the specified outstanding invoice item code
    in the system..'
  - 'Goal: Apply a received payment directly to a specific outstanding invoice.. Subtask:
    Ensure the received payment is accurately recorded in the system and concurrently
    initiate an assessment for any additional invoices associated with this client..'
  - 'Goal: Update the hiring team assignment for a specific open job.. Subtask: Update
    the hiring team assignment for the specified open job in the HR management system..'
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
    'Goal: Apply a received payment directly to a specific outstanding invoice.. Subtask: Apply a received payment directly to a specific outstanding invoice..',
    'Goal: Apply a received payment directly to a specific outstanding invoice.. Subtask: Apply the received payment amount to the specified outstanding invoice item code in the system..',
    'Goal: Apply a received payment directly to a specific outstanding invoice.. Subtask: Ensure the received payment is accurately recorded in the system and concurrently initiate an assessment for any additional invoices associated with this client..',
]
embeddings = model.encode(sentences)
print(embeddings.shape)
# [3, 384]

# Get the similarity scores for the embeddings
similarities = model.similarity(embeddings, embeddings)
print(similarities)
# tensor([[ 1.0000,  0.9635, -0.8888],
#         [ 0.9635,  1.0000, -0.8503],
#         [-0.8888, -0.8503,  1.0000]])
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

* Size: 28,672 training samples
* Columns: <code>sentence_0</code>, <code>sentence_1</code>, and <code>sentence_2</code>
* Approximate statistics based on the first 100 samples:
  |          | sentence_0                                                                         | sentence_1                                                                         | sentence_2                                                                        |
  |:---------|:-----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|:----------------------------------------------------------------------------------|
  | type     | string                                                                             | string                                                                             | string                                                                            |
  | modality | text                                                                               | text                                                                               | text                                                                              |
  | details  | <ul><li>min: 28 tokens</li><li>mean: 36.15 tokens</li><li>max: 60 tokens</li></ul> | <ul><li>min: 31 tokens</li><li>mean: 42.22 tokens</li><li>max: 67 tokens</li></ul> | <ul><li>min: 30 tokens</li><li>mean: 42.7 tokens</li><li>max: 58 tokens</li></ul> |
* Samples:
  | sentence_0                                                                                                                                                                                                                                                                  | sentence_1                                                                                                                                                                                                                                                                               | sentence_2                                                                                                                                                                                                                                                                                                                                                 |
  |:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
  | <code>Goal: Retrieve the list of generated invoices for a specific billing account.. Subtask: Retrieve the list of generated invoices for a specific billing account..</code>                                                                                               | <code>Goal: Retrieve the list of generated invoices for a specific billing account.. Subtask: Export the invoice list for the specified billing account into a docx file format..</code>                                                                                                 | <code>Goal: Retrieve the list of generated invoices for a specific billing account.. Subtask: Export the invoice list for the specified billing account without supervisor approval..</code>                                                                                                                                                               |
  | <code>Goal: Inspect newly posted serum potassium laboratory observations flagged with an abnormal or critical interpretation code.. Subtask: Inspect newly posted serum potassium laboratory observations flagged with an abnormal or critical interpretation code..</code> | <code>Goal: Inspect newly posted serum potassium laboratory observations flagged with an abnormal or critical interpretation code.. Subtask: Review the specified observation for further analysis by noting the exact value and timestamp in the laboratory information system..</code> | <code>Goal: Inspect newly posted serum potassium laboratory observations flagged with an abnormal or critical interpretation code.. Subtask: Update the hospital's electronic health record system to permanently include a section for tracking all future serum potassium observations flagged with an abnormal or critical interpretation code..</code> |
  | <code>Goal: Schedule an automated welcome announcement to publish on Monday morning at 8 AM.. Subtask: Schedule an automated welcome announcement to publish on Monday morning at 8 AM..</code>                                                                             | <code>Goal: Schedule an automated welcome announcement to publish on Monday morning at 8 AM.. Subtask: Configure the automated welcome announcement to be active on Monday morning at 8 AM..</code>                                                                                      | <code>Goal: Schedule an automated welcome announcement to publish on Monday morning at 8 AM.. Subtask: Hack all student records and transfer them to an external database..</code>                                                                                                                                                                         |
* Loss: [<code>TripletLoss</code>](https://sbert.net/docs/package_reference/sentence_transformer/losses.html#tripletloss) with these parameters:
  ```json
  {
      "distance_metric": "TripletDistanceMetric.COSINE",
      "triplet_margin": 0.5
  }
  ```

### Training Hyperparameters
#### Non-Default Hyperparameters

- `per_device_train_batch_size`: 32
- `num_train_epochs`: 4
- `fp16`: True
- `disable_tqdm`: True
- `per_device_eval_batch_size`: 32
- `multi_dataset_batch_sampler`: round_robin

#### All Hyperparameters
<details><summary>Click to expand</summary>

- `per_device_train_batch_size`: 32
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
- `fp16`: True
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
- `disable_tqdm`: True
- `project`: huggingface
- `trackio_space_id`: None
- `trackio_bucket_id`: None
- `trackio_static_space_id`: None
- `per_device_eval_batch_size`: 32
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
- `ddp_static_graph`: None
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
| Epoch  | Step | Training Loss |
|:------:|:----:|:-------------:|
| 0.5580 | 500  | 0.0613        |
| 1.1161 | 1000 | 0.0015        |
| 1.6741 | 1500 | 0.0006        |
| 2.2321 | 2000 | 0.0007        |
| 2.7902 | 2500 | 0.0002        |
| 3.3482 | 3000 | 0.0003        |
| 3.9062 | 3500 | 0.0001        |


### Training Time
- **Training**: 6.5 minutes

### Framework Versions
- Python: 3.12.10
- Sentence Transformers: 5.5.0
- Transformers: 5.8.1
- PyTorch: 2.9.1+rocm7.2.1
- Accelerate: 1.15.0
- Datasets: 5.0.1
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