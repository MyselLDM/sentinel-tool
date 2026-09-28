# Sentinel model training (`training/`)

Code that trains the **two models the FastAPI service serves** — the NLI
cross-encoder (SentinelAgent **P2** intent verifier) and the contrastive
bi-encoder (**the thesis' proposed solution**) — on DelegationBench v4, and the
statistics needed to answer the thesis' research questions.

> The checkpoints currently in `fastapi/.models/` are the base (un-fine-tuned)
> models. This directory produces the **fine-tuned** artifacts and the
> calibrated thresholds/metrics in `training/models/`.

## Files

| File | Purpose |
| --- | --- |
| `common.py` | Shared utilities: dataset loading, **training-parity** text formatting, binary metrics (TPR/FPR/Precision/F1), per-subset/per-policy breakdowns, the shared 5-fold split, JSON helpers. Not run directly. |
| `train_nli.py` | Fine-tune `cross-encoder/nli-MiniLM2-L6-H768` (3-class) with 5-fold CV + off-the-shelf baseline. |
| `train_contrastive.py` | Fine-tune `all-MiniLM-L12-v2` (TripletLoss, cosine) with 5-fold CV. |
| `compare_models.py` | RQ3 one-tailed paired t-test + merged `models/model_config.json`. |
| `dataset.csv` | DelegationBench v4 (9,900 `anchor`/`positive`/`negative` rows, 448 goals). |
| `old-training/` | The original scripts used as the reference for this pipeline. |
| `plan.md`, `Thesis.md` | FastAPI inference plan and the thesis (problem statement, metrics). |

## Data → model mapping

Each dataset row is a delegation scenario with a benign side (`positive`) and a
malicious side (`negative`):

* **NLI** trains on pairs — `(anchor, positive)` → `entailment`, `(anchor,
  negative)` → `contradiction`. Premise/hypothesis strings are byte-identical to
  `fastapi/app/preprocess.py`. *(The dataset has no `neutral` examples, but the
  head keeps 3 labels so the checkpoint stays compatible with the service, which
  reads `p(contradiction) = softmax(logits)[0]`.)*
* **Contrastive** trains on framed triples — `(anchor, positive, negative)` with
  the raw `"Goal: {goal}. Subtask: {subtask}."` template on both sides (casing
  preserved), the deployed `-raw-` variant.

**Malicious subsets (thesis comparison):** negatives are split by `policy_name` —
**explicit attacks** = P-01 Obvious Malicious Intent + P-04 Data Exfiltration;
**adversarial paraphrases** = everything else (scope creep, constraint removal,
resource/temporal expansion, …). Metrics are reported for both, per fold.

**Decision rules:** NLI `p(contradiction) > threshold`; contrastive
`cosine < threshold`. The deployment threshold is the **mean of the per-fold
F1-optimal cut-offs** (5-fold CV), exactly as `Thesis.md` specifies.

**Paired evaluation:** `common.make_folds` uses `StratifiedGroupKFold` grouped by
goal and stratified by policy, so no goal leaks across the split and both models
see the *same* folds — a precondition for the paired t-test.

## Running

Use the FastAPI virtualenv (it already has the ML stack; add `accelerate` if
missing — see `requirements.txt`):

```bash
PY=../fastapi/.venv/Scripts/python.exe      # Windows
# PY=../fastapi/.venv/bin/python            # macOS / Linux

# quick smoke test (a handful of goals, 1 epoch, 2 folds)
$PY train_nli.py          --limit-anchors 20 --folds 2 --epochs 1
$PY train_contrastive.py  --limit-anchors 20 --folds 2 --epochs 1 --max-triplets-per-anchor 32
$PY compare_models.py

# full runs (CPU; expect hours)
$PY train_nli.py
$PY train_contrastive.py
$PY compare_models.py
```

Common flags: `--limit-anchors N`, `--folds K`, `--fold-strategy {group,stratified}`,
`--epochs`, `--batch-size`, `--lr`, `--seed`, `--no-train-final`, `--save-folds`.
`train_contrastive.py` also has `--max-triplets-per-anchor` / `--margin`.

## GPU acceleration (AMD Radeon on Windows / ROCm)

`--device` defaults to `auto`: it uses the GPU when PyTorch can see one, else CPU.
On ROCm builds the GPU is exposed through the **CUDA** API (HIP), so it appears as
`torch.cuda` — no special device string is needed. Verify with:

```bash
$PY check_gpu.py           # prints device/arch and runs a real matmul + backward
```

### Setup on this machine (verified working)

Prerequisites: Python 3.12 and **AMD HIP SDK for Windows 7.2** —
<https://www.amd.com/en/developer/resources/rocm-hub/hip-sdk.html>.

```bash
./setup_gpu_amd.sh              # creates C:\sentinel-gpu and gets GPU compute working
./run_gpu.sh check_gpu.py       # sanity check (matmul + backward)
./run_gpu.sh train_nli.py       # full run on the GPU
```

`setup_gpu_amd.sh` creates a **space-free** venv, installs AMD's Windows ROCm
PyTorch wheel (`torch==2.9.1+rocm7.2.1` from
`repo.radeon.com/rocm/windows/rocm-rel-7.2.1/` — a plain file listing, hence
`--find-links`), **overlays the HIP SDK's runtime DLLs + device bitcode over the
pip wheel's**, installs the training stack, and runs the check.

That overlay is the critical fix: the `rocm-sdk-core` pip wheel ships an
`amdhip64_7.dll` that cannot JIT-link its device library
(`ld.lld: error: undefined hidden symbol: __amd_fillBufferAligned2D` → kernel
launch access-violation). The SDK's own runtime links correctly.

Three AMD/Windows quirks are handled automatically:

| Quirk | Symptom | Handled by |
| --- | --- | --- |
| Space in the working directory | `0xC0000005` segfault on the first GPU op | `run_gpu.sh` (launches from the space-free venv dir); `common.guard_rocm_windows_cwd` raises a clear error instead |
| dGPU **and** iGPU both exposed as `cuda` | `'DataParallel' object has no attribute 'device'` | `common.pin_visible_gpus` (`--gpu N`, default pins device 0) |
| ROCm wheel lacks `torch._C._distributed_c10d` | `accelerate` import failure in `prepare_model` | `common.patch_rocm_windows_torch` (stubs `torch.distributed.tensor`) |

Verified on this box: `torch 2.9.1+rocm7.2.1`, `hip 7.2.53211`, device
`AMD Radeon RX 9060 XT` (`gfx1200`), materially faster than CPU per epoch.

## Outputs (relative to `training/`)

```
logs/nli_cv_results.json           per-fold + aggregate NLI metrics, baseline block
logs/contrastive_cv_results.json   per-fold + aggregate contrastive metrics
logs/comparison_results.json       RQ3 paired t-tests (vs baseline and fine-tuned NLI)
models/sentinelagent-nli-finetuned/            final NLI model (all data)
models/<contrastive-…-raw>/                    final contrastive model (all data)
models/*/training_stats.json                   the training statistics for that model
models/model_config.json                       merged, FastAPI-compatible config
```

Every run logs: overall Accuracy / TPR / FPR / Precision / F1, the same metrics
for the adversarial-paraphrase and explicit-attack subsets, per-policy TPR, the
confusion matrix (per fold + pooled), and the per-fold thresholds — for both the
deployment (mean) threshold and each fold's own F1-optimal threshold.

## Deploying the artifacts

`models/model_config.json` has the same shape FastAPI reads. To wire the
fine-tuned models in, copy the model directories into `fastapi/.models/` and
point `fastapi/model_config.json` at them (or copy this file over it):

```bash
cp -r training/models/sentinelagent-nli-finetuned        fastapi/.models/
cp -r training/models/contrastive-miniLM-*-raw           fastapi/.models/
```

The `model_dir` entries are names relative to `MODELS_DIR` (default
`fastapi/.models`), so no other change is needed.
