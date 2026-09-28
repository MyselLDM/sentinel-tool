---
tags:
- sentence-transformers
- cross-encoder
- reranker
- generated_from_trainer
- dataset_size:19800
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
# [[-2.6094  4.9375 -3.1719]
#  [ 6.3125 -3.     -3.4219]
#  [-2.4219  4.9062 -3.3125]
#  [ 6.2188 -3.1406 -3.0781]
#  [-2.4375  4.9062 -3.3125]]
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

* Size: 19,800 training samples
* Columns: <code>sentence1</code>, <code>sentence2</code>, and <code>label</code>
* Approximate statistics based on the first 100 samples:
  |          | sentence1                                                                          | sentence2                                                                          | label                                           |
  |:---------|:-----------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------|:------------------------------------------------|
  | type     | string                                                                             | string                                                                             | int                                             |
  | modality | text                                                                               | text                                                                               |                                                 |
  | details  | <ul><li>min: 28 tokens</li><li>mean: 28.73 tokens</li><li>max: 30 tokens</li></ul> | <ul><li>min: 17 tokens</li><li>mean: 26.25 tokens</li><li>max: 34 tokens</li></ul> | <ul><li>0: ~50.00%</li><li>1: ~50.00%</li></ul> |
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
| 0.0808 | 50   | 1.7305        |
| 0.1616 | 100  | 0.2664        |
| 0.2423 | 150  | 0.1178        |
| 0.3231 | 200  | 0.1222        |
| 0.4039 | 250  | 0.1183        |
| 0.4847 | 300  | 0.0887        |
| 0.5654 | 350  | 0.0756        |
| 0.6462 | 400  | 0.0820        |
| 0.7270 | 450  | 0.1124        |
| 0.8078 | 500  | 0.1061        |
| 0.8885 | 550  | 0.0480        |
| 0.9693 | 600  | 0.0651        |
| 1.0501 | 650  | 0.0729        |
| 1.1309 | 700  | 0.0536        |
| 1.2116 | 750  | 0.0568        |
| 1.2924 | 800  | 0.0507        |
| 1.3732 | 850  | 0.0539        |
| 1.4540 | 900  | 0.0535        |
| 1.5347 | 950  | 0.0464        |
| 1.6155 | 1000 | 0.0598        |
| 1.6963 | 1050 | 0.0523        |
| 1.7771 | 1100 | 0.0639        |
| 1.8578 | 1150 | 0.0420        |
| 1.9386 | 1200 | 0.0411        |
| 2.0194 | 1250 | 0.0490        |
| 2.1002 | 1300 | 0.0253        |
| 2.1809 | 1350 | 0.0374        |
| 2.2617 | 1400 | 0.0463        |
| 2.3425 | 1450 | 0.0449        |
| 2.4233 | 1500 | 0.0269        |
| 2.5040 | 1550 | 0.0288        |
| 2.5848 | 1600 | 0.0296        |
| 2.6656 | 1650 | 0.0330        |
| 2.7464 | 1700 | 0.0306        |
| 2.8271 | 1750 | 0.0472        |
| 2.9079 | 1800 | 0.0352        |
| 2.9887 | 1850 | 0.0260        |
| 3.0695 | 1900 | 0.0314        |
| 3.1502 | 1950 | 0.0240        |
| 3.2310 | 2000 | 0.0265        |
| 3.3118 | 2050 | 0.0357        |
| 3.3926 | 2100 | 0.0168        |
| 3.4733 | 2150 | 0.0178        |
| 3.5541 | 2200 | 0.0287        |
| 3.6349 | 2250 | 0.0159        |
| 3.7157 | 2300 | 0.0267        |
| 3.7964 | 2350 | 0.0192        |
| 3.8772 | 2400 | 0.0148        |
| 3.9580 | 2450 | 0.0285        |


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