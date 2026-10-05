# new_dataset_1 - isolated training package for dataset-v3

Everything needed to train and compare the two models on dataset-v3, self-contained.
**All output lands in this folder** (`logs/`, `models/`); nothing here writes to the
parent `training/` pipeline.

Read `data/DATASET_V3.md` **section 4** before quoting any accuracy figure. This
corpus has a high lexical ceiling (AUC 0.981), which governs how a result can be
stated.

---

## 1. Layout

| path | role |
| --- | --- |
| `common.py` | shared library: dataset-v3 loader, folds, metrics, device/ROCm helpers |
| `train_nli.py` | fine-tunes the NLI cross-encoder (3-label) |
| `train_contrastive.py` | fine-tunes the contrastive bi-encoder (TripletLoss) |
| `compare_models.py` | RQ3 paired t-tests; writes `models/model_config.json` |
| `check_gpu.py` | verifies PyTorch can actually run a GPU kernel |
| `run_gpu.sh` / `run_gpu.ps1` | run one script from a space-free cwd (ROCm requirement) |
| `run_all_gpu.sh` | runs all three steps for one protocol, detached, then archives |
| `self_test.py` | verifies the data layer - no GPU needed |
| `self_test_pipeline.py` | dry-runs the log contract through `compare_models` - no GPU |
| `data/` | the dataset (see `data/DATASET_V3.md`) |

---

## 2. Running it

```bash
cd "D:/My Code/sentinel/training/training/new_dataset_1"

# a) verify the data layer and the JSON contract first - seconds, no GPU
/c/sentinel-gpu/Scripts/python.exe self_test.py
/c/sentinel-gpu/Scripts/python.exe self_test_pipeline.py

# b) one protocol end to end, detached (~40-60 min)
./run_all_gpu.sh group          # primary: goal-grouped CV, unseen goals
./run_all_gpu.sh stratified     # what the reference script did
./run_all_gpu.sh cue            # concept-disjoint split (loads data/cue_split.csv)

tail -f logs/run_group.log
grep -E "STEP|exit=" logs/run_group.status

# c) or a single trainer
./run_gpu.sh train_nli.py --epochs 4 --fold-strategy group
./run_gpu.sh check_gpu.py       # if anything GPU-related looks wrong
```

`run_all_gpu.sh` runs, in order: `train_nli.py`, `train_contrastive.py`,
`compare_models.py`, then archives the three JSONs into `logs/<strategy>/` so a second
protocol cannot clobber the first.

---

## 3. Outputs

| path | contents |
| --- | --- |
| `logs/nli_cv_results.json` | full NLI run log (folds, aggregate, baseline, final model) |
| `logs/contrastive_cv_results.json` | full contrastive run log |
| `logs/comparison_results.json` | RQ3 paired t-tests |
| `logs/<strategy>/` | archived copies, one directory per protocol |
| `models/sentinelagent-nli-finetuned/` | final NLI checkpoint + `training_stats.json` |
| `models/contrastive-*/` | final contrastive checkpoint + `training_stats.json` |
| `models/model_config.json` | merged FastAPI deployment config |

---

## 4. NLI: fidelity to the reference fine-tune script

`old-training/sentinelagent_nli_finetune.py` is the only NLI trainer the original model
had. This package reproduces its protocol step for step; only the corpus and the report
breakdown differ.

| reference step | here | status |
| --- | --- | --- |
| `format_for_nli`: `"An AI agent is authorized to <goal>. The agent performs only tasks that support this goal."` / `"The agent is now performing: <subtask>"` | `common.format_nli` - identical strings, lowercased | same |
| 3-label head `[contradiction, entailment, neutral]`, index 0 malicious | `CrossEncoder(..., num_labels=3)` | same |
| `to_probabilities` - softmax if raw logits, pass through if already a distribution | `common.to_probabilities` | same |
| `find_best_threshold` - sweep `linspace(0,1,201)`, maximise malicious F1 | `common.find_best_threshold` | same |
| decision `p(contradiction) > threshold` | `HIGHER_IS_MALICIOUS = True` | same |
| metrics: accuracy, TPR, FPR, precision, F1, threshold | `common.metrics_from_confusion` + `summarize_v3` | same, plus per-stratum |
| **off-the-shelf baseline evaluated, no training** | `--eval-baseline` (default on), scored on the same folds | same |
| cross-validation | `--folds 5`; `group` (goal-grouped) is the default, `stratified` reproduces the reference's label-stratified split | same, extra option |
| final model trained on all data | `--train-final` (default on) | same |
| `logs/nli_cv_results.json` with `recommended_nli_threshold` = mean of per-fold cut-offs | same file; threshold key is `final_threshold` | same |
| **15 epochs on ~200 examples (~150 steps)** | **`--epochs 4`** on 584 rows (as requested) | deliberate |

The one intentional difference is the epoch budget, at your instruction. The reference's
15 epochs were tuned on a ~200-example set; on 584 rows that is a much larger
optimisation budget, and 4 keeps NLI and contrastive on a matched outer protocol.

Two changes the corpus forces: **one row is one NLI pair** (dataset-v3 is
`(goal, subtask, label)`, not the v2 `anchor/positive/negative` triplet shape), and
**class 2 (neutral) is populated**, whereas dataset_v2 had no neutral examples and left
the head's third class untrained.

---

## 5. Contrastive: the approach and why it fits the thesis

The legacy `old-training/train_contrastive.py` trained on `(goal, benign, malicious)`
triples assembled from every positive x negative pair within a goal, on a corpus whose
negatives differed from positives by *tokens*, and evaluated on the full dataset (not
held out). That approach does not fit this thesis, for three reasons:

1. **It was not held out.** Evaluation on training data inflates every number.
2. **Its negatives were too easy.** A wide token gap is separable lexically; the thesis
   needs the decision to hinge on authorisation, not wording.
3. **It had no matched budget.** 15 epochs there vs 4 here made the comparison
   uninterpretable.

`train_contrastive.py` here keeps the parts that carry the thesis and fixes those:

* **Base and loss**: `all-MiniLM-L12-v2` with
  `TripletLoss(distance_metric=COSINE, margin)` - the same loss family, so the
  architecture comparison is genuinely architecture vs architecture.
* **Decision**: `cosine < threshold`, the mirror of the NLI's `p(contradiction) > thr`.
* **Triplets come from `pair_id` first.** dataset-v3 pairs a benign sibling with its
  violation, one qualifier (`near_miss`) or one role (`matched`) apart. Those are hard
  negatives, which is exactly what TripletLoss needs and what the reference corpus could
  not supply. `--hard-negatives-only` uses nothing else.
* **Framing matches inference**: anchor = `format_document(goal, goal)`, positives and
  negatives = `format_document(goal, subtask)`, the same strings the service scores.
* **Matched budget**: 4 epochs, same folds, same seed, same protocol as NLI, so the
  paired t-test is legitimate.
* **Off-the-shelf baseline**: the untrained bi-encoder is scored on the same folds.

The strongest systematic negatives are available here, which is the point: at 138
`pair_id` pairs (55 `near_miss` + 83 `matched`) the contrastive model is trained on
near-identical benign/violation text, the setting where a cosine boundary should have an
advantage over a contradiction head.

---

## 6. Metrics recorded

Both trainers log the same shape, so the runs are directly pairable:

* **Headline**: TPR, FPR, Precision, F1, accuracy, threshold, `threshold_f1`,
  confusion counts (`tp/fp/tn/fn`).
* **By stratum** - dataset-v3's attack taxonomy, replacing the v2 policy breakdown:
  `easy` (blunt attacks + routine work), `near_miss` (one qualifier swapped),
  `matched` (same concept and verb, different authorisation), plus `hard`/`control` when
  the holdout is scored. Per-stratum TPR is what the thesis compares.
* **By source** (`original_190`, `generated`, `v3-matched`, holdout generations), so a
  result can be traced to how the rows were made.
* **Per-epoch curve** on the held-out fold (`aggregate_curve`), so over/under-fitting is
  visible, not inferred.
* **Baseline block**: the off-the-shelf model's folds, aggregate and threshold, on the
  same folds.
* **Compute block**: device, precision, torch/HIP versions, VRAM.
* **`compare_models.py`** then runs one-tailed paired t-tests across the identical folds
  for TPR / Precision / F1 (greater) and FPR (less), **and for each stratum present in
  every fold of both models** (`hard_tpr`, `matched_tpr`, `near_miss_tpr`, `easy_tpr`),
  reporting `t`, `p`, effect size `d_z` and a decision. It also merges
  `models/model_config.json` for deployment.

The `cue` protocol touches a different set of metrics: the test set's concept families
are unseen, so its per-stratum numbers are the generalisation evidence rather than the
headline.

---

## 7. GPU requirements, and the failure mode to expect

* The GPU venv must be at a **space-free path** (`C:\sentinel-gpu` by default, override
  with `SENTINEL_GPU_VENV`). The repo path contains a space and AMD ROCm on Windows
  crashes if the process starts there - that is why `run_gpu.sh` exists.
* **Stop the local llama.cpp servers before training** (ports 8081/8082). They hold the
  same GPU; a held context plus a wedged HIP runtime is the usual cause of an
  `access violation` at the very first GPU kernel.
* If `check_gpu.py` fails at the **first GPU op** while device enumeration succeeds, the
  fault is environmental. Diagnosed on this machine (Oct 2026); the isolation below is
  worth reusing because it separates "torch is broken" from "the GPU is broken".

  **What the failure is NOT.** An earlier note here claimed `hipMemGetInfo` was failing
  and that torch's allocator therefore died. **That was wrong.** `hipMemGetInfo` returns
  `rc=1` only when called *before any context exists*; call it after a `hipMalloc` and it
  returns `rc=0` with correct free memory. It was a bad probe, not a fault - do not chase
  it. Allocation is also fine: `torch.cuda.caching_allocator_alloc(4096)` succeeds.

  **What it actually is.** The HIP runtime API works end to end, torch's context init
  works, and allocation works - but **the first GPU kernel launch through torch crashes**
  with an access violation. `torch.zeros(4, device='cuda')` zero-fills (a memset kernel)
  and `.cuda()` copies (a memcpy kernel), so both die; `caching_allocator_alloc`, which
  only allocates, succeeds. `check_gpu.py` line 98 is the matmul, same thing.

  ```bash
  # confirms it is kernel dispatch, not allocation or the allocator
  /c/sentinel-gpu/Scripts/python.exe -c "import torch; torch.cuda.init(); \
    print('init ok'); print('alloc ok', torch.cuda.caching_allocator_alloc(4096)); \
    print('now a kernel...'); torch.zeros(4, device='cuda')"
  ```

  **Ruled out, each tested:** a reboot; the virtual display adapter (`ROOT\DISPLAY\0000`,
  disabled, no change); a driver update (version unchanged, `32.0.31041.1004`); PATH
  pollution (cleaned PATH); the venv's DLL overlay (all 19 SDK DLLs byte-identical, and
  loading the SDK's `amdhip64_7.dll` by absolute path behaves identically); missing
  gfx1200 code objects (343 present); `HSA_OVERRIDE_GFX_VERSION=11.0.0`;
  `PYTORCH_NO_CUDA_MEMORY_CACHING=1`; `PYTORCH_CUDA_ALLOC_CONF`; `AMD_SERIALIZE_KERNEL=3`;
  `HSA_ENABLE_SDMA=0`; `HIP_VISIBLE_DEVICES=0`; and the llama.cpp servers (down).

  **DEFINITIVE FINDING (supersedes everything above): the GPU cannot launch a kernel
  at the HIP level, outside torch entirely.** `hipMemset` launches a memset kernel; it
  crashes the process, reproducibly, while `hipMalloc` in the same process returns 0:

  ```bash
  /c/sentinel-gpu/Scripts/python.exe -c "import ctypes; \
    h=ctypes.WinDLL(r'C:\sentinel-gpu\Lib\site-packages\_rocm_sdk_core\bin\amdhip64_7.dll'); \
    h.hipInit(0); h.hipSetDevice(0); p=ctypes.c_void_p(); \
    print('malloc', h.hipMalloc(ctypes.byref(p), ctypes.c_size_t(1<<20))); \
    print('memset', h.hipMemset(p, ctypes.c_int(0), ctypes.c_size_t(1<<20)))"
  ```

  Prints `malloc 0` then dies - no `memset` line. **It fails on the iGPU too**
  (`HIP_VISIBLE_DEVICES=1`), so it is not this card's hardware: context creation and
  allocation work on both GPUs, kernel execution fails on both. That rules out torch,
  the venv, the ROCm install layout, PATH/env vars, the display adapter, and the dGPU
  itself, all in one go - every hypothesis above is subsumed by this.

  **The "driver reinstall" did not actually replace the driver.** Checked afterwards: no
  new DriverStore package (newest `amdwin-u0203304.inf_amd64_*` dated Sep 24) and
  `oem12.inf` still Sep 24, with the driver version unchanged at `32.0.31041.1004` - the
  installer saw the same version present and skipped it. A genuine replacement has not
  been attempted, which is why the fault persists.

  Next, in order:

  1. **DDU in Safe Mode** (this forces removal; an in-place installer run will not),
     then install the driver. Prefer a **different version** from `32.0.31041.1004` so
     the replacement is real - a version-specific regression would otherwise persist.
  2. If both GPUs still fail to launch kernels after a genuine replacement, the shared
     suspects are the **ROCm code-object/JIT path** (note the version skew: HIP SDK on
     disk is `7.2.60201-38d754472` while the pip runtime is `7.2.53211-158bd99533`, and
     the setup script overlays the former's DLLs and bitcode over the latter) or
     Windows' graphics stack after an update. Installing a **matching** HIP SDK for the
     pip runtime, or reinstalling Windows' graphics stack, is the next lever.
  3. Report the `hipMemset` result to AMD if step 1 does not fix it - "allocation works,
     every kernel launch faults, on two different GPUs" is a precise bug report.

  **Rebuilding the venv does NOT help - verified.** `setup_gpu_amd.sh` ran to completion
  in ~90 s with **zero packages installed** (`Successfully installed` absent), i.e. the
  whole GPU stack was already intact and nothing was corrupt; step 5 segfaulted at the
  same first kernel. It does correctly re-apply the HIP SDK overlay, so re-running it is
  still safe, just not a fix. Do not spend another cycle on the venv.

  Suggestive but **not conclusive** traces of a driver-side problem on this machine:
  two staged DriverStore packages for the same INFs (`amdwin-u0203304.inf_*` and
  `u0203304.inf_*`), a `C:\AMD\AMD-Software-Installer\Bin64\*.tmp` staging pair, and 12
  entries in `PendingFileRenameOperations`. None of these is proof - AMD's installer
  leaves staging files normally - but together they point at an AMD driver/chipset
  update that did not complete cleanly, which fits the timeline.

  Timing evidence that makes that more than a guess: the installed AMD components are on
  **mixed branches** - `AMD Software` / `RadeonSoftwareVersion` **26.8.1** (driver
  `32.0.31041.1004`, dated 8-17-2026) while `AMD WVR64`, `AMD DVR` and `AMD Install
  Manager` are all **26.10.x**, and `AMD Install Manager 26.10.26272` has
  `InstallDate 20261002` - **the day the GPU last worked (Oct 2, 10:12) and just before
  it broke.**

  **Recommended repair, and what NOT to do:**

  1. **DDU clean, then install ONE consistent AMD Software version using the installer's
     "Factory Reset" option.** Install the **latest WHQL Adrenalin**, not a rollback -
     the system is already half-way onto the 26.10 branch, so a fresh consistent install
     completes that transition instead of fighting it. Pick Adrenalin *or* PRO, never both.
  2. **Do NOT update ROCm.** Keep HIP SDK 7.2 + `rocm-sdk-*` 7.2.1 +
     `torch 2.9.1+rocm7.2.1`. It worked, the gfx1200 code objects are present, the wheels
     are cached (32 GB) and upstream-free to reinstall, and upgrading invalidates the
     whole validated stack for no expected gain.
  3. **AMD does not pin an Adrenalin version for ROCm 7.2.x on Windows** - the ROCm
     Windows docs (system requirements / install) state only the OS and the supported
     GPU list (`RX 9060 XT, RDNA4, gfx1200` is listed as fully supported), with no driver
     version. So there is no "ROCm-matched driver" to chase; consistency is what matters.
  4. **Hygiene:** this box has three ROCm trees - `C:\Program Files\AMD\ROCm\6.2`,
     `...\7.2` and `C:\TheRock`. Conflicting ROCm installs caused a JIT-link crash here
     before. Remove the unused 6.2 / TheRock once 7.2 is confirmed working.
* `common.ensure_space_free_temp()` moves `TEMP`/`TMP` to `%LOCALAPPDATA%\Temp` before
  torch is imported - a non-default temp path has crashed the first GPU op here.

`self_test.py` and `self_test_pipeline.py` need **no GPU at all**, so the data layer and
the JSON contract can be checked while the GPU is unavailable.

---

## 8. Known limitations

1. **The lexical ceiling (AUC 0.981).** A bag of words separates authorised from
   unauthorised almost perfectly on the concept-disjoint split. Quote accuracy against
   it, and prefer threshold stability, calibration and FPR at strict operating points -
   where the two architectures can actually differ. This is the dominant limitation.
2. **The `cue` test set is a single concept family** (`demographic_proxy`, 84 rows), so
   concept-disjoint generalisation is measured on one held-out kind of overreach, not
   several. The concept breadth is there in training (8 families).
3. **FPR resolution**: 24-26 benign rows in the holdout means FPR resolves to ~4%.
4. **Length is a weak shortcut**, concentrated in `pair_style=append` rows
   (+5.36 words) and absent in `swap` rows (+0.70). Filter on `pair_style` for a
   length-matched subset.
5. **`subject_health` is thin** in the matched stratum: when examining the individual
   *is* the job, no authorised counterpart exists for a single-case goal.
6. **`subtask` is normalised** (trailing sentence periods stripped corpus-wide, because
   they leaked the label). Apply the same normalisation to new text at inference.
7. **Not wired to deployment.** `fastapi/` still loads the previous checkpoints and
   `fastapi/model_config.json` is not updated by this package; deploying these models is
   a separate step, and `deploy_to_fastapi.sh` was not copied here.

---

## 9. Provenance

The corpus and every audit behind it: `../../dataset-v3/DATASET_V3.md`,
`../../../data-gen/AUDIT_LOG.md` (10 audit entries, each with findings and changes) and
`../../../data-gen/AUDIT_REPORT.md`.
