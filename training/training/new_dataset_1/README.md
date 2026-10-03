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
* If `check_gpu.py` fails at the matmul step while device enumeration succeeds, the
  runtime is wedged rather than the code being wrong: restart the GPU (reboot is the
  reliable reset) and re-run `./run_gpu.sh check_gpu.py`.
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
