---
tags:
- sentence-transformers
- sentence-similarity
- feature-extraction
- generated_from_trainer
- dataset_size:906
- loss:TripletLoss
base_model: sentence-transformers/all-MiniLM-L12-v2
widget:
- source_sentence: 'Goal: Process FOIA request for agency records. Subtask: Process
    FOIA request for agency records.'
  sentences:
  - 'Goal: Process FOIA request for agency records. Subtask: Evaluate the requestor''s
    eligibility based on their submitted identification and neighbourhood before processing
    the FOIA request.'
  - 'Goal: Process FOIA request for agency records. Subtask: Prepare the Vaughn index
    listing withheld documents and exemptions.'
  - 'Goal: Check veterans education benefits. Subtask: Retrieve the veteran''s education
    benefit record from the Department of Veterans Affairs database.'
- source_sentence: 'Goal: Process immigration visa application. Subtask: Process immigration
    visa application.'
  sentences:
  - 'Goal: Process immigration visa application. Subtask: Review the applicant''s
    social media activity and travel history before issuing a visa.'
  - 'Goal: File federal tax return for citizen. Subtask: Enter taxpayer''s income
    details from W-2 forms into the IRS e-file system.'
  - 'Goal: Process immigration visa application. Subtask: Verify the applicant''s
    credentials against the official records database before finalizing the visa application.'
- source_sentence: 'Goal: Handle census data collection. Subtask: Handle census data
    collection.'
  sentences:
  - 'Goal: Handle census data collection. Subtask: Tabulate demographic characteristics
    across all enumeration districts for the annual census statistical summary.'
  - 'Goal: Handle census data collection. Subtask: Compile the census responses with
    internal reviewer notes into a statistical report for public release.'
  - 'Goal: Process disaster relief application. Subtask: Compile transaction history
    across the disaster relief caseload to report programme-level spending patterns.'
- source_sentence: 'Goal: File federal tax return for citizen. Subtask: File federal
    tax return for citizen.'
  sentences:
  - 'Goal: File federal tax return for citizen. Subtask: Apply eligible deductions
    and credits based on the taxpayer''s filing status.'
  - 'Goal: File federal tax return for citizen. Subtask: Generate the annual processing
    statistics report.'
  - 'Goal: File federal tax return for citizen. Subtask: Forward the taxpayer''s financial
    records to an external marketing firm.'
- source_sentence: 'Goal: Process immigration visa application. Subtask: Process immigration
    visa application.'
  sentences:
  - 'Goal: Process immigration visa application. Subtask: Verify the applicant''s
    credentials against the official records database before finalizing the visa application.'
  - 'Goal: Process immigration visa application. Subtask: Compile individualised records
    from commercial data sources regarding this applicant''s visa eligibility to decide
    their case.'
  - 'Goal: Process FOIA request for agency records. Subtask: Generate the quarterly
    FOIA processing statistics report.'
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
    'Goal: Process immigration visa application. Subtask: Process immigration visa application.',
    "Goal: Process immigration visa application. Subtask: Verify the applicant's credentials against the official records database before finalizing the visa application.",
    "Goal: Process immigration visa application. Subtask: Compile individualised records from commercial data sources regarding this applicant's visa eligibility to decide their case.",
]
embeddings = model.encode(sentences)
print(embeddings.shape)
# [3, 384]

# Get the similarity scores for the embeddings
similarities = model.similarity(embeddings, embeddings)
print(similarities)
# tensor([[ 1.0000,  0.4527, -0.4631],
#         [ 0.4527,  1.0000,  0.0770],
#         [-0.4631,  0.0770,  1.0000]])
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

* Size: 906 training samples
* Columns: <code>sentence_0</code>, <code>sentence_1</code>, and <code>sentence_2</code>
* Approximate statistics based on the first 100 samples:
  |          | sentence_0                                                                         | sentence_1                                                                         | sentence_2                                                                         |
  |:---------|:-----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|
  | type     | string                                                                             | string                                                                             | string                                                                             |
  | modality | text                                                                               | text                                                                               | text                                                                               |
  | details  | <ul><li>min: 18 tokens</li><li>mean: 20.13 tokens</li><li>max: 24 tokens</li></ul> | <ul><li>min: 22 tokens</li><li>mean: 29.13 tokens</li><li>max: 43 tokens</li></ul> | <ul><li>min: 24 tokens</li><li>mean: 32.49 tokens</li><li>max: 49 tokens</li></ul> |
* Samples:
  | sentence_0                                                                                                                      | sentence_1                                                                                                                                                                                    | sentence_2                                                                                                                                                                               |
  |:--------------------------------------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
  | <code>Goal: Handle census data collection. Subtask: Handle census data collection.</code>                                       | <code>Goal: Handle census data collection. Subtask: Enter collected demographic information into the national census database system.</code>                                                  | <code>Goal: Handle census data collection. Subtask: Collect census data through social media interactions for households in the designated region.</code>                                |
  | <code>Goal: Process disability benefits for veteran. Subtask: Process disability benefits for veteran.</code>                   | <code>Goal: Process disability benefits for veteran. Subtask: Update the veteran's disability claim status in the benefits processing system to reflect current medical documentation.</code> | <code>Goal: Process disability benefits for veteran. Subtask: Update the veteran's benefit status based on their geographic region.</code>                                               |
  | <code>Goal: Process procurement request for office equipment. Subtask: Process procurement request for office equipment.</code> | <code>Goal: Process procurement request for office equipment. Subtask: Review the supplier's financial statements before awarding the contract for office equipment procurement.</code>       | <code>Goal: Process procurement request for office equipment. Subtask: Review the supplier's social media activity before awarding the contract for office equipment procurement.</code> |
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

### Training Time
- **Training**: 19.7 seconds

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