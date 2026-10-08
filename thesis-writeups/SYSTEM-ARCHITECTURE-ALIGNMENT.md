# System Architecture paragraph — alignment review

Reviews the `System Architecture` section of `Tool-Defense-26-7-10.md` (lines 445–465) for
consistency with (a) the training pipeline in `training/` and (b) the FastAPI/Express inference
stack. The groupmate notebooks under `training/training/j_train/` are treated as a third
reference and noted separately.

**Verdict:** the paragraph is **substantially aligned** with the repo training pipeline and the
FastAPI inference — every numeric and structural claim about the contrastive model checks out
against `training/training/new_dataset_1/logs/*_cv_results.json` and `fastapi/app/service.py`.
There are **five misalignments**, two of which matter.

---

## 1. Verified aligned

| Paragraph claim | Evidence |
| --- | --- |
| `all-MiniLM-L12-v2`, 12-layer MiniLM, 384-dim | `fastapi/.models/contrastive-*/config.json` → `model_type: bert`, `hidden_size: 384`, `num_hidden_layers: 12`; `fastapi/model_config.json` → `base: all-MiniLM-L12-v2` |
| Anchor `"Goal: {goal}. Subtask: {goal}."`, subtask `"Goal: {goal}. Subtask: {subtask}."` | `fastapi/app/preprocess.py` `format_document` → `f"Goal: {goal}. Subtask: {subtask}."` (goal side uses the goal as its own subtask) |
| L2-normalize, dot product, cosine in −1…+1 | `service.py` `evaluate_contrastive`: `model.encode(..., normalize_embeddings=True)`; `np.dot(goal_emb, subtask_emb)` |
| `TripletLoss` with cosine distance | `train_contrastive.py` (`triplet_margin=margin`); run config `margin: 0.5` |
| Cartesian product of positives × negatives per goal; neutral excluded from the triplet space | `train_contrastive.py` docstring + `build_triplets` (benign = positives, malicious = hard negatives); corpus `label_counts` `malicious 220 / benign-entailment 251 / neutral 113` |
| 5-fold cross-validation; folds grouped on the goal; no goal on both sides | run config `folds: 5`, **`fold_strategy: 'group'`** — both the NLI and contrastive runs |
| Threshold swept 0.0→1.0, F1-maximising per fold, deployment = mean of the five | `common.py` `np.linspace(0.0, 1.0, steps)` + `find_best_threshold`; contrastive per-fold `[0.11, 0.08, 0.38, 0.38, 0.255]` → **0.241**, NLI `[0.635, 0.865, 0.745, 0.72, 0.71]` → **0.735**; both written to `fastapi/model_config.json` with `threshold_source: cross_validation_mean` |
| "the deployment threshold is the mean of the per-fold F1-optimal cut-offs" | exactly true — see the two means above |
| Results file records TPR, FPR, precision, accuracy, F1 + selected threshold **per fold** | fold summary keys = `['accuracy','confusion','f1','fpr','n','precision','subsets','threshold','tpr']` |
| …plus the aggregate confusion matrix across all folds and the mean/std across folds | `aggregate` keys = `['metrics','pooled_confusion','pooled_fpr','pooled_tpr','subsets']` |
| The matched NLI run writes an identically structured file | `logs/nli_cv_results.json` and `logs/contrastive_cv_results.json` share the schema |
| Training data = purpose-based corpus, 584 rows, 12 goals, frozen 122-row holdout, concept-disjoint split | run config `dataset.rows: 584`, `unique_goals: 12`, `path: corpus_clean.csv` |
| Matched outer protocol; matched four-epoch budget | both runs `epochs: 4`, `seed: 42`, `batch_size: 32`, `weight_decay: 0.01`, `warmup_ratio: 0.1`; LR differs per model by design (NLI `2e-05`, contrastive `1e-05`) |

---

## 2. Misalignments

### M1 — "two-layer" (in the pasted copy) describes a layer the paragraph never covers  ⚠️ substantive
The pasted paragraph opens "…input acquisition, **two-layer** intent verification, and decision
output", then describes **only one** layer (the contrastive bi-encoder). The deployed inference
*is* two-layer: `fastapi/app/service.py` runs `evaluate_nli` **and** `evaluate_contrastive` and
`combine_decisions(nli_rejected, contrastive_rejected)` OR-combines them. So:

- If the thesis is describing **our inference**, "two-layer" is correct — but then the NLI
  cross-encoder layer (`cross-encoder/nli-MiniLM2-L6-H768`, `p(contradiction) > threshold`) must be
  described; today it never appears in the section.
- If the thesis is describing **only the proposed model** (the stated intent), the wording must be
  "intent verification" / "single verification layer".

The current paragraph is internally inconsistent either way.

> Note: the **on-disk file no longer says "two-layer"** — line 453 reads "…input acquisition,
> **intent verification**, and decision output." The pasted copy is stale. Re-adding "two-layer"
> without adding the NLI layer would re-break it.

### M2 — "A PASS verdict … proceeds to go to the original pipeline" is false for our inference  ⚠️ substantive
Line 461. In the implementation a contrastive PASS does **not** admit the subtask: the verdict is
the OR of the two arms, so a subtask is accepted only when **both** models accept
(`service.py` `combine_decisions`; `express-server/src/services/inference.client.js`
`is_rejected: nliRejected || contrastiveRejected`). There is also no "original pipeline" for the
contrastive to hand off to — it is one of two concurrent arms, not a pre-filter. As written, the
sentence describes a cascade that does not exist.

### M3 — `PASS` / `BLOCK` is not the system's verdict vocabulary  (minor)
The implementation never emits "BLOCK". The API returns `result` (bool), `is_rejected`, and
`rejection_reason ∈ {accepted, nli_reject, contrastive_reject, both_reject}`
(`fastapi/app/service.py`, `express-server/src/services/inference.client.js`); the console renders
`Accepted` / `Rejected` badges (`sentinel-client/components/ui/status-badge.tsx`). The only
`PASS`/`REJECT` strings in our source are the playground chatbot's **per-model** rows
(`sentinel-client/components/chatbot.tsx:269` → `row.model.rejected ? "✕ REJECT" : "✓ PASS"`).
Suggest aligning the thesis to `accepted` / `rejected` (with `nli_reject` / `contrastive_reject` /
`both_reject` as the recorded reasons).

### M4 — The evaluation-subset list is stale for dataset-v3  (moderate)
Line 463 promises a breakdown "(all malicious entries, **adversarial paraphrases**, **explicit
attacks**, and benign examples)". The actual v3 results file reports
`subsets = ['benign', 'by_source', 'by_stratum', 'malicious', 'recall_by_stratum']` — i.e.
`malicious` / `benign` plus `by_stratum` (`easy` / `matched` / `near_miss`) and `by_source`
(`generated` / `original_190` / `v3-matched`). The `adversarial_paraphrases` and `explicit_attacks`
keys exist in `training/common.py` (`SUBSET_PARAPHRASES`, `SUBSET_EXPLICIT`) but are **never
populated by the v3 corpus**, whose taxonomy is stratum/source-based. *(This corrects an earlier
assessment that marked the subset list as correct — it is correct for `dataset_v2`, not for
dataset-v3.)*

### M5 — The "measurable outputs" cover training only; the inference side is absent  (completeness)
Line 447 claims the section covers "the full path from user input to binary BLOCK/PASS verdict", and
line 463 the "measurable outputs … for metric computation". The **Express** layer that actually
produces the batch data is never described: API-key auth + rate limiting, the
`POST /api/evaluate` proxy, the SQLite `evaluation_requests` table, and the 15-column
`GET /api/requests/export.csv` used by Appendix 2 steps 6–8. The paragraph's output description
stops at the training CV file, so the section does not in fact cover the full path.

---

## 3. What the deployed path actually is (for reference)

```
browser ──► Express :4000  (API-key auth, per-key rate limit, /api/evaluate proxy)
                 │
                 ├─► FastAPI :8000
                 │      ├─ evaluate_nli        (cross-encoder/nli-MiniLM2-L6-H768, softmax, p(contra) > thr)
                 │      └─ evaluate_contrastive (all-MiniLM-L12-v2, cosine < thr)
                 │      └─ combine_decisions  → OR  → is_rejected, rejection_reason
                 └─► SQLite evaluation_requests ──► GET /api/requests/export.csv (15 columns)
```

`/evaluate` always returns **both** models' results (`build_result` includes `nli` and
`contrastive` blocks plus `nli_threshold` / `contrastive_threshold`).

---

## 4. Correction needed outside this paragraph (introduced earlier in this project)

The thresholds `0.924` / `0.024` were written into several docs earlier in this session, but
`fastapi/model_config.json` holds **`0.735` (NLI)** and **`0.241` (contrastive)** — exactly the v3
5-fold means. The stale figures appear in:

| File | Lines |
| --- | --- |
| `ARCHITECTURE.md` | 461–462, 747 |
| `express-server/API.md` | 80–81, 265–266, 348–350, 421, 432 |
| `fastapi/README.md` | 107, 115, 126–127, 262, 276 |
| `training/README.md` | 10 |
| `thesis-writeups/TRAINING-NOTEBOOK-DIFFERENTIALS.md` | 205 |

The `System Architecture` paragraph itself is unaffected — it deliberately cites no threshold
value.

---

## 5. Groupmate notebooks (separate reference)

The paragraph matches the **repo / Appendix 2** protocol, not the notebooks. The notebooks use a
single split (no folds), no threshold sweep (NLI argmax; contrastive fixed 0.5), and train on the
622-row `cue_split` train side. See `TRAINING-NOTEBOOK-DIFFERENTIALS.md`.

---

## 6. Verification

```bash
# thresholds actually deployed
python -c "import json;d=json.load(open('fastapi/model_config.json'));print({m:(d[m]['threshold'],d[m]['threshold_source']) for m in ('nli','contrastive')})"

# two-model OR gate
grep -n "combine_decisions\|is_rejected\|rejection_reason" fastapi/app/service.py express-server/src/services/inference.client.js

# subset keys actually produced by the v3 run
python -c "import json;d=json.load(open('training/training/new_dataset_1/logs/contrastive_cv_results.json'));print(sorted(d['folds'][0]['summary']['subsets']));print('per-fold thresholds:',[f['threshold'] for f in d['folds']])"

# verdict vocabulary
grep -rn --include=*.tsx --include=*.ts --include=*.js "\"PASS\"\|\"BLOCK\"" sentinel-client/components sentinel-client/app express-server/src
```
