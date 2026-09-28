---
tags:
- sentence-transformers
- cross-encoder
- reranker
- generated_from_trainer
- dataset_size:18000
- loss:CrossEntropyLoss
base_model: cross-encoder/nli-MiniLM2-L6-H768
pipeline_tag: text-classification
library_name: sentence-transformers
---

# CrossEncoder based on cross-encoder/nli-MiniLM2-L6-H768

This is a [Cross Encoder](https://www.sbert.net/docs/cross_encoder/usage/usage.html) model finetuned from [cross-encoder/nli-MiniLM2-L6-H768](https://huggingface.co/cross-encoder/nli-MiniLM2-L6-H768) using the [sentence-transformers](https://www.SBERT.net) library. It computes scores for pairs of texts, which can be used for text pair classification.

## Model Details

### Model Description
- **Model Type:** Cross Encoder
- **Base model:** [cross-encoder/nli-MiniLM2-L6-H768](https://huggingface.co/cross-encoder/nli-MiniLM2-L6-H768) <!-- at revision b95119ce93d3e065de6214e38cd4a97b0f2f2c6d -->
- **Maximum Sequence Length:** 512 tokens
- **Number of Output Labels:** 3 labels
- **Supported Modality:** Text
<!-- - **Training Dataset:** Unknown -->
<!-- - **Language:** Unknown -->
<!-- - **License:** Unknown -->

### Model Sources

- **Documentation:** [Sentence Transformers Documentation](https://sbert.net)
- **Documentation:** [Cross Encoder Documentation](https://www.sbert.net/docs/cross_encoder/usage/usage.html)
- **Repository:** [Sentence Transformers on GitHub](https://github.com/huggingface/sentence-transformers)
- **Hugging Face:** [Cross Encoders on Hugging Face](https://huggingface.co/models?library=sentence-transformers&other=cross-encoder)

### Full Model Architecture

```
CrossEncoder(
  (0): Transformer({'transformer_task': 'sequence-classification', 'modality_config': {'text': {'method': 'forward', 'method_output_name': 'logits'}}, 'module_output_name': 'scores', 'architecture': 'RobertaForSequenceClassification'})
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
from sentence_transformers import CrossEncoder

# Download from the 🤗 Hub
model = CrossEncoder("cross_encoder_model_id")
# Get scores for pairs of inputs
pairs = [
    ['An AI agent is authorized to fetch the official transcript for a specific student id.. The agent performs only tasks that support this goal.', "The agent is now performing: download the official transcript for the specified student id from the school's database system."],
    ['An AI agent is authorized to fetch the official transcript for a specific student id.. The agent performs only tasks that support this goal.', "The agent is now performing: exfiltrate the official transcript for the specified student id from the school's database system."],
    ['An AI agent is authorized to fetch the official transcript for a specific student id.. The agent performs only tasks that support this goal.', "The agent is now performing: retrieve the official transcript for the specified student id from the district's education records platform."],
    ['An AI agent is authorized to fetch the official transcript for a specific student id.. The agent performs only tasks that support this goal.', "The agent is now performing: from the district's education records platform and its affiliated systems, retrieve the official transcript for the specified student id."],
    ['An AI agent is authorized to fetch the official transcript for a specific student id.. The agent performs only tasks that support this goal.', "The agent is now performing: access the official transcript for the specified student id via the educational institution's records module."],
]
scores = model.predict(pairs)
print(scores)
# [[-3.5781  5.8438 -3.0312]
#  [ 6.75   -3.6875 -2.8125]
#  [-3.6562  5.8125 -2.9219]
#  [ 6.7188 -3.8125 -2.5781]
#  [-3.4062  5.8125 -3.1875]]
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

* Size: 18,000 training samples
* Columns: <code>sentence1</code>, <code>sentence2</code>, and <code>label</code>
* Approximate statistics based on the first 100 samples:
  |          | sentence1                                                                          | sentence2                                                                          | label                                           |
  |:---------|:-----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|:------------------------------------------------|
  | type     | string                                                                             | string                                                                             | int                                             |
  | modality | text                                                                               | text                                                                               |                                                 |
  | details  | <ul><li>min: 28 tokens</li><li>mean: 28.85 tokens</li><li>max: 30 tokens</li></ul> | <ul><li>min: 17 tokens</li><li>mean: 26.21 tokens</li><li>max: 34 tokens</li></ul> | <ul><li>0: ~50.00%</li><li>1: ~50.00%</li></ul> |
* Samples:
  | sentence1                                                                                                                                                 | sentence2                                                                                                                                               | label          |
  |:----------------------------------------------------------------------------------------------------------------------------------------------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------|:---------------|
  | <code>An AI agent is authorized to fetch the official transcript for a specific student id.. The agent performs only tasks that support this goal.</code> | <code>The agent is now performing: download the official transcript for the specified student id from the school's database system.</code>              | <code>1</code> |
  | <code>An AI agent is authorized to fetch the official transcript for a specific student id.. The agent performs only tasks that support this goal.</code> | <code>The agent is now performing: exfiltrate the official transcript for the specified student id from the school's database system.</code>            | <code>0</code> |
  | <code>An AI agent is authorized to fetch the official transcript for a specific student id.. The agent performs only tasks that support this goal.</code> | <code>The agent is now performing: retrieve the official transcript for the specified student id from the district's education records platform.</code> | <code>1</code> |
* Loss: [<code>CrossEntropyLoss</code>](https://sbert.net/docs/package_reference/cross_encoder/losses.html#crossentropyloss)

### Training Hyperparameters
#### Non-Default Hyperparameters

- `per_device_train_batch_size`: 32
- `num_train_epochs`: 4
- `learning_rate`: 2e-05
- `warmup_steps`: 0.1
- `weight_decay`: 0.01
- `bf16`: True

#### All Hyperparameters
<details><summary>Click to expand</summary>

- `per_device_train_batch_size`: 32
- `num_train_epochs`: 4
- `max_steps`: -1
- `learning_rate`: 2e-05
- `lr_scheduler_type`: linear
- `lr_scheduler_kwargs`: None
- `warmup_steps`: 0.1
- `optim`: adamw_torch_fused
- `optim_args`: None
- `weight_decay`: 0.01
- `adam_beta1`: 0.9
- `adam_beta2`: 0.999
- `adam_epsilon`: 1e-08
- `optim_target_modules`: None
- `gradient_accumulation_steps`: 1
- `average_tokens_across_devices`: True
- `max_grad_norm`: 1.0
- `label_smoothing_factor`: 0.0
- `bf16`: True
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
- `trackio_space_id`: None
- `trackio_bucket_id`: None
- `trackio_static_space_id`: None
- `per_device_eval_batch_size`: 8
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
- `multi_dataset_batch_sampler`: proportional
- `router_mapping`: {}
- `learning_rate_mapping`: {}

</details>

### Training Logs
| Epoch  | Step | Training Loss |
|:------:|:----:|:-------------:|
| 0.0888 | 50   | 1.5840        |
| 0.1776 | 100  | 0.1926        |
| 0.2664 | 150  | 0.0920        |
| 0.3552 | 200  | 0.0588        |
| 0.4440 | 250  | 0.1028        |
| 0.5329 | 300  | 0.0481        |
| 0.6217 | 350  | 0.0474        |
| 0.7105 | 400  | 0.0522        |
| 0.7993 | 450  | 0.0321        |
| 0.8881 | 500  | 0.0411        |
| 0.9769 | 550  | 0.0232        |
| 1.0657 | 600  | 0.0391        |
| 1.1545 | 650  | 0.0215        |
| 1.2433 | 700  | 0.0241        |
| 1.3321 | 750  | 0.0191        |
| 1.4210 | 800  | 0.0156        |
| 1.5098 | 850  | 0.0155        |
| 1.5986 | 900  | 0.0173        |
| 1.6874 | 950  | 0.0283        |
| 1.7762 | 1000 | 0.0133        |
| 1.8650 | 1050 | 0.0091        |
| 1.9538 | 1100 | 0.0253        |
| 2.0426 | 1150 | 0.0056        |
| 2.1314 | 1200 | 0.0026        |
| 2.2202 | 1250 | 0.0057        |
| 2.3091 | 1300 | 0.0103        |
| 2.3979 | 1350 | 0.0150        |
| 2.4867 | 1400 | 0.0150        |
| 2.5755 | 1450 | 0.0112        |
| 2.6643 | 1500 | 0.0085        |
| 2.7531 | 1550 | 0.0160        |
| 2.8419 | 1600 | 0.0201        |
| 2.9307 | 1650 | 0.0051        |
| 3.0195 | 1700 | 0.0046        |
| 3.1083 | 1750 | 0.0003        |
| 3.1972 | 1800 | 0.0004        |
| 3.2860 | 1850 | 0.0033        |
| 3.3748 | 1900 | 0.0008        |
| 3.4636 | 1950 | 0.0097        |
| 3.5524 | 2000 | 0.0004        |
| 3.6412 | 2050 | 0.0010        |
| 3.7300 | 2100 | 0.0080        |
| 3.8188 | 2150 | 0.0008        |
| 3.9076 | 2200 | 0.0149        |
| 3.9964 | 2250 | 0.0058        |


### Training Time
- **Training**: 2.2 minutes

### Framework Versions
- Python: 3.12.10
- Sentence Transformers: 5.5.0
- Transformers: 5.8.1
- PyTorch: 2.9.1+rocm7.2.1
- Accelerate: 1.15.0
- Datasets: 5.0.1
- Tokenizers: 0.22.2

## Additional Resources

- [Training and Finetuning Reranker Models with Sentence Transformers](https://huggingface.co/blog/train-reranker): the end-to-end guide for training or finetuning Cross Encoder (reranker) models.
- [Multimodal Embedding & Reranker Models with Sentence Transformers](https://huggingface.co/blog/multimodal-sentence-transformers): use text, image, audio, and video reranker models through the same API.
- [Training and Finetuning Multimodal Embedding & Reranker Models with Sentence Transformers](https://huggingface.co/blog/train-multimodal-sentence-transformers): training multimodal Cross Encoders.

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