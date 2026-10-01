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
| `compare_models.py` | RQ3 one-tailed paired t-test + merged `models/model_config.json`. `--protocol group` reads `logs/group/` (use it for the deployment config). |
| `run_gpu.sh` / `run_gpu.ps1` | Run one script on the GPU (launch from a space-free cwd; `-X faulthandler`). |
| `run_all_gpu.sh` | Whole pipeline for **one** protocol, archiving results to `logs/<protocol>/`. |
| `run_protocols_gpu.sh` | Runs `group` then `sample`; touches `logs/RUN_DONE`. |
| `deploy_to_fastapi.sh` / `.ps1` | Atomically deploy models + config into `fastapi/`, then verify they resolve. `--verify` asserts the *running* service isn't on base models. |
| `archive_output.ps1` | File one session's `logs/` `models/` `review/` into `.output/<timestamp>/`. |
| `check_gpu.py` | Device/arch + real matmul + backward; dumps env, `PATH`, `cwd`, free VRAM. |
| `analyse_fit.py` | Over/under-fit diagnosis from existing artefacts (curves, train-vs-held-out gap, error concentration). |
| `audit_dataset.py`, `flag_questionable_rows.py`, `review_sheet.py` | Corpus label-quality audit, row-level triage sheet, and a blind review sheet + scorer. |
| `dataset.csv` | DelegationBench v4, original (9,900 `anchor`/`positive`/`negative` rows, 448 goals, policies P-01…P-11). |
| `dataset_v2.csv` | **Active** (via `common.DATASET_PATH`): drops the P-10 *Replay Exploitation* family and renumbers the rest (`P-11 → P-10`), so 9,000 rows / policies P-01…P-10. Built by `make_dataset_v2.py`; `dataset.csv` is left untouched. |
| `.output/` | One folder per archived training session (gitignored). See *Session archives*. |
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

## Training configuration (the thesis' matched-budget control)

The two models are compared as *architectures*, so the **outer protocol is
identical for both** — dataset, the 5-fold group-stratified split (same seed),
the binary malicious/positive class, the metric definitions, the adversarial-
paraphrase / explicit subsets, the threshold-selection rule (per-fold F1-optimal
→ mean), and the **matched epoch budget of 4**.

**Matched budget means matched *opportunity*, not identical numbers.** The two
losses are different by construction (3-class cross-entropy vs
`TripletLoss(cosine, margin)`), and an "epoch" is not a common unit — one NLI
epoch is ~15,840 pairs, one contrastive epoch is ~23,000 triplets. Forcing the
same learning rate or step count across them would handicap one model, so per-
model learning rate / margin stay as each architecture requires. Report it as:

> *identical outer protocol (data, folds, seed, batch size, optimizer,
> selection); per-model loss and learning rate; matched 4-epoch budget.*

Defaults: `--epochs 4 --batch-size 32`, NLI `--precision bf16`, contrastive
`--use-amp --max-triplets-per-anchor 64`. (15 epochs — as in `old-training/` —
was tuned on 200 examples (~150 steps); on 9,900 rows it is ~100x more
optimization and mostly buys memorization.)

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
`--epochs` (default 4), `--batch-size` (32), `--lr`, `--seed`, `--device auto`,
`--gpu N`, `--no-train-final`, `--save-folds`, `--no-eval-baseline`,
`--no-eval-per-epoch`. `train_nli.py` adds `--precision {fp32,fp16,bf16}`
(default bf16); `train_contrastive.py` adds `--max-triplets-per-anchor` (64),
`--margin`, and `--use-amp` / `--no-use-amp`.

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

One-time setup — **Git Bash only** (`.sh` scripts don't execute in PowerShell/cmd):

```bash
./setup_gpu_amd.sh              # creates C:\sentinel-gpu and gets GPU compute working
```

Then launch from whichever shell you use:

```powershell
# PowerShell (Windows default)
.\run_gpu.ps1 check_gpu.py      # sanity check (matmul + backward)
.\run_gpu.ps1 train_nli.py
```

```bash
# Git Bash
./run_gpu.sh check_gpu.py
./run_gpu.sh train_nli.py
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
| **Non-default `%TEMP%`/`%TMP%`** | `0xC0000005` on the **first GPU op** (device enumeration still works); e.g. a `TEMP` with a space, `C:\Windows\Temp`, or any freshly created writable dir | `common.ensure_space_free_temp` — repoints `TEMP`/`TMP` at `%LOCALAPPDATA%\Temp` before `import torch` (COMGR latches `%TEMP%` at load) |
| Space in the working directory | `0xC0000005` segfault on the first GPU op | `run_gpu.sh` / `run_gpu.ps1` (launch from the space-free venv dir); `common.guard_rocm_windows_cwd` raises a clear error instead |
| dGPU **and** iGPU both exposed as `cuda` | `'DataParallel' object has no attribute 'device'` | `common.pin_visible_gpus` (`--gpu N`, default pins device 0) |
| ROCm wheel lacks `torch._C._distributed_c10d` | `accelerate` import failure in `prepare_model` | `common.patch_rocm_windows_torch` (stubs `torch.distributed.tensor`) |

Run `check_gpu.py` first — it dumps the relevant env vars, the full `PATH`, the
`cwd`, and free VRAM, so a crash is diagnosable instead of silent (both launchers
and every script enable `faulthandler`).

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

Every run logs three levels of metrics, so you can see the model **before, during
and after** training:

- **Before training** — `baseline`: the *untrained* model evaluated on each
  fold's test set under the same protocol (per-fold F1-optimal threshold), plus
  the aggregate. Disable with `--no-eval-baseline`.
- **During training** — `folds[i].training_curve` and the mean-across-folds
  `aggregate_curve`: one row per epoch with Accuracy / TPR / FPR / Precision /
  F1 / adversarial-paraphrase TPR / explicit-attack TPR. **Epoch 0 is the
  untrained model**, then 1..N. Disable with `--no-eval-per-epoch`.
- **After training** — `folds[i].summary` (per fold) and `aggregate` /
  `aggregate_fixed_threshold` (mean ± std), plus the pooled confusion matrix and
  per-policy TPR.

The per-epoch rows evaluate the fold's **test** set and are **diagnostic only** —
the epoch budget stays fixed at 4 (never chosen from the curve), so the reported
post-training numbers are not selected on the test fold. Full metric list:
Accuracy, TPR, FPR, Precision, F1, per-subset TPR (malicious / adversarial
paraphrases / explicit attacks), per-policy TPR, and confusion matrices.

## Session archives (`.output/`)

Each training session gets its own folder under `.output/`, named for the minute it
was filed: `.output/<yyyy-MM-dd_HHmm>/`. Archive one session with:

```powershell
cd training
.\archive_output.ps1                                  # .output\2026-10-02_0715\
.\archive_output.ps1 -Name v2-anchor-cv               # .output\2026-10-02_0715-v2-anchor-cv\
.\archive_output.ps1 -DryRun                          # show what would move
```

It creates the timestamped folder and **moves** `logs/`, `models/` and `review/`
into it (skipping any that are missing/empty), writes a short `session.txt`
manifest, then exits — leaving a clean tree for the next run. Two sessions filed in
the same minute never merge: the second becomes `<stamp>-2`.

**Archive after deploying, not before.** `deploy_to_fastapi.sh` / `.ps1` reads
`models/model_config.json` and, when it must regenerate it, `logs/<protocol>/`.
Archiving moves both out of the working tree, so deploy first or re-run training.
`.output/` is gitignored — the archives contain full run trees including weights.

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
