# Sentinel Inference — FastAPI Service Plan

> **Status:** Draft for review. `fastapi/` currently contains only `old-training/` (the model training scripts). Nothing is implemented yet.
> **Owner:** `fastapi`
> **Scope:** Plan the inference microservice — what routes to expose, how to load the two MiniLM models, the exact preprocessing inferred from the training code, the `/evaluate` contract, config, performance, and testing.
> **Companion docs:** [`../express-server/plan.md`](../express-server/plan.md), [`../sentinel-client/plan.md`](../sentinel-client/plan.md).

This service is the **only** place the models run. Express never loads models; it proxies to this service. Everything below is derived from `old-training/` so inference exactly mirrors training.

---

## Table of Contents

1. [What we inferred from `old-training/`](#1-what-we-inferred-from-old-training)
2. [Role & architecture](#2-role--architecture)
3. [Model config: `model_config.json`](#3-model-config-model_configjson)
4. [Preprocessing (must replicate training exactly)](#4-preprocessing-must-replicate-training-exactly)
5. [Decision logic](#5-decision-logic)
6. [Project structure](#6-project-structure)
7. [Model loading & lifecycle](#7-model-loading--lifecycle)
8. [Routes to expose](#8-routes-to-expose)
9. [Contract: `POST /evaluate`](#9-contract-post-evaluate)
10. [Contract: `GET /models`](#10-contract-get-models)
11. [Performance (caching, batching, device)](#11-performance-caching-batching-device)
12. [Errors & health](#12-errors--health)
13. [Testing](#13-testing)
14. [Deployment](#14-deployment)
15. [Milestones](#15-milestones)
16. [Decisions & open questions](#16-decisions--open-questions)
17. [Appendix](#17-appendix)

---

## 1. What we inferred from `old-training/`

Three scripts define the exact behavior we must reproduce:

| File | What it defines |
| --- | --- |
| `sentinelagent_nli_finetune.py` | NLI fine-tune on `cross-encoder/nli-MiniLM2-L6-H768`, 3 classes, **argmax** evaluation. |
| `train_contrastive.py` | Contrastive fine-tune of `all-MiniLM-L12-v2` (TripletLoss, cosine), **F1-optimal threshold** sweep. |
| `eval_contrastive.py` | Per-fold thresholds read from CV results; per-subset metrics. |

### 1.1 NLI model (`cross-encoder/nli-MiniLM2-L6-H768`, fine-tuned)

From `format_for_nli` and `evaluate_model` (lines 501–549):

```python
premise    = f"An AI agent is authorized to {goal.lower()}. The agent performs only tasks that support this goal."
hypothesis = f"The agent is now performing: {subtask.lower()}"
scores     = model.predict([(premise, hypothesis)])[0]   # RAW LOGITS (see below)
pred_label = int(np.argmax(scores))
malicious  = (pred_label == 0)
```

- **Label order (critical):** `0 = contradiction`, `1 = entailment`, `2 = neutral`. Confirmed against the shipped `config.json` `id2label` — so **`scores[0]` is contradiction**, not `scores[2]`.
- **`predict` returns raw logits.** The shipped `config_sentence_transformers.json` sets `activation_fn = torch.nn.modules.linear.Identity`, so **no softmax is applied** — you must softmax yourself before using `p(contradiction)` (§1.4, §5).
- The training script uses **argmax** (no numeric threshold). Per decision D2 (§16) we instead use an **F1-tuned probability threshold on `p(contradiction)`**, which the training emits (see §3.2).
- Final fine-tuned model: `.models/sentinelagent_nli_finetuned/`.

### 1.2 Contrastive model (`all-MiniLM-L12-v2`, fine-tuned)

From `format_document`, `evaluate_contrastive` (lines 105–140, 324–400):

```python
text  = f"Goal: {goal}. Subtask: {subtask}."        # raw template (this run used -raw-)
goal_emb = model.encode(goal_text,  normalize_embeddings=True)
sub_emb  = model.encode(sub_text,   normalize_embeddings=True)
cos_sim  = float(np.dot(goal_emb, sub_emb))          # == cosine (normalized)
malicious = cos_sim < threshold                       # LOW similarity = malicious
```

- **Input is a framed template, not raw goal/subtask.** Both sides are built with `format_document`:
  - "goal side" = `format_document(goal, goal, …)` → `"Goal: {goal}. Subtask: {goal}."`
  - "subtask side" = `format_document(goal, subtask, …)` → `"Goal: {goal}. Subtask: {subtask}."`
- Optional `decomposed` dict with keys `{action, object, scope, constraints}` appends natural-language lines. The **shipped** model is the `-raw-` variant (`USE_DECOMPOSED=False`) and its training data had empty decomposed dicts, so **inference must not pass decomposed components** — use `include_decomposed=False` (or pass `{}`).
- **Threshold is learned from training:** `evaluate_contrastive` sweeps `np.linspace(0.0, 1.0, 201)` and picks the threshold maximizing F1; per-fold thresholds live in `logs/contrastive_cv_results.json`. The shipped dir name encodes the hyperparameters: `.models/contrastive-miniLM-e4-b16-lr1e-05-mn6-**raw**-vs0.2`.

### 1.3 Corrections this implies for the other plans

1. **NLI raw scores key order** — `{contradiction, entailment, neutral}` (contradiction ∈ index 0), not `[entailment, neutral, contradiction]`.
2. **NLI scores are normalized to probabilities** (softmax) before thresholding — the shipped model returns **logits** (`activation_fn = Identity`). The training script's `to_probabilities()` is the reference (§1.4).
3. **Contrastive input** — must use the framed `"Goal: … Subtask: …"` template on *both* sides, not `encode(goal)`/`encode(subtask)` separately.
4. **Thresholds are training artifacts** → not user-editable → the `thresholds` write endpoint and `threshold_configs` table are dropped (see express plan §7/§9).
5. **Model `lower()`ing** — NLI lowercases goal/subtask; contrastive does **not** (it preserves original casing).

### 1.4 Deployed artifacts (verified in `.models/`)

Both checkpoints are present in `fastapi/.models/` (1.1 GB total). FastAPI loads **these** dirs:

| Model | Directory | Verified config |
| --- | --- | --- |
| NLI (final) | `.models/sentinelagent_nli_finetuned/` | `RobertaForSequenceClassification`; `id2label {0:contradiction,1:entailment,2:neutral}`; `num_hidden_layers 6`, `hidden_size 768`; 512 tokens; **`activation_fn = Identity` → logits** |
| Contrastive (final) | `.models/contrastive-miniLM-e4-b16-lr1e-05-mn6-raw-vs0.2/` | `BertModel`, 384-dim; `Pooling(mean)` + `Normalize`; `similarity_fn_name: cosine`; trained **`raw`** (`USE_DECOMPOSED=False`) |
| Contrastive (folds) | `…/fold_0..4/` | CV checkpoints — **not** used at inference; keep for evaluation only |

- Both were saved with **sentence-transformers 5.5.0** (transformers 5.8.1 for NLI, 5.3.0 for contrastive). `requirements.txt` pins `sentence-transformers==5.5.0` + `transformers==5.8.1` to match.
- **No threshold is stored anywhere in `.models/`** (nor any `logs/*_cv_results.json`) — thresholds must be produced by training (§3.2).
- The contrastive model-card widget confirms the template: `'Goal: X. Subtask: X.'` ↔ `'Goal: X. Subtask: Y.'`.
- The `*.safetensors` weights are git-ignored (`.gitignore`), so only the small configs/tokenizers are committed.

---

## 2. Role & architecture

```
express-server ──HTTP JSON──▶ fastapi (this service)
                                 ├─ CrossEncoder  (NLI, fine-tuned or base)
                                 └─ SentenceTransformer (contrastive, fine-tuned or base)
```

- Single stateless HTTP service; both models loaded **once** at startup (lifespan) and kept in memory.
- No database. The only config is a committed `model_config.json` + a few env vars.
- CPU inference by default; GPU optional via env.

---

## 3. Model config: `model_config.json`

**Decision D3:** a committed artifact is the single source of truth for model versions + thresholds + metrics. Training writes it; the service reads it.

### 3.1 Shape

```jsonc
// fastapi/model_config.json  (produced by training, committed)
{
  "generated_at": "2026-04-20T00:00:00Z",
  "nli": {
    "base": "cross-encoder/nli-MiniLM2-L6-H768",
    "model_dir": "sentinelagent_nli_finetuned",   // relative to MODELS_DIR (default: fastapi/.models), or an HF id
    "version": "sentinelagent-nli-3class-v1",
    "labels": ["contradiction", "entailment", "neutral"],
    "decision": "p_contradiction > threshold",
    "threshold": 0.62,
    "metrics": { "accuracy": 0.94, "tpr": 0.91, "fpr": 0.06, "precision": 0.93, "f1": 0.92 }
  },
  "contrastive": {
    "base": "all-MiniLM-L12-v2",
    "model_dir": "contrastive-miniLM-e4-b16-lr1e-05-mn6-raw-vs0.2",
    "version": "contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2",
    "decision": "cosine < threshold",
    "threshold": 0.58,
    "metrics": { "tpr": 0.88, "fpr": 0.07, "precision": 0.90, "f1": 0.89 }
  }
}
```

### 3.2 Producing it (training emits the thresholds)

- The contrastive threshold comes from `evaluate_contrastive` (F1-optimal). Aggregate the per-fold thresholds (mean) → `contrastive.threshold`.
- The NLI threshold is emitted by `sentinelagent_nli_finetune.py` — **implemented**: `to_probabilities()` + `find_best_threshold()` sweep `p(contradiction)` over `np.linspace(0,1,201)` per CV fold (the same method as contrastive), and the run writes `logs/nli_cv_results.json` with `recommended_nli_threshold` = **mean of the per-fold F1-optimal cut-offs** (an unbiased, held-out estimate) plus per-fold metrics. Use that value for `nli.threshold`.
- The two `logs/*_cv_results.json` artifacts are the inputs to a small merge that produces `model_config.json`.
- **Normalization matters (confirmed from the artifact):** the shipped NLI `config_sentence_transformers.json` sets `activation_fn = Identity`, so `CrossEncoder.predict` returns **raw logits**. Apply softmax before thresholding/scoring; `to_probabilities()` in the training script is the reference implementation. `argmax` is unaffected (softmax is monotonic), so the existing 3-class metrics are unchanged.

### 3.3 Loading & fallback

- `MODELS_DIR` (env, default `.`) resolves `model_dir`; missing → **fall back to the base model** (`base` HF id) so dev works before fine-tuned artifacts exist (**D4**).
- If `model_config.json` is missing, use base models with placeholder thresholds and `version: "base"`; log a loud warning.

---

## 4. Preprocessing (must replicate training exactly)

`fastapi/app/preprocess.py`:

```python
def format_nli(goal: str, subtask: str) -> tuple[str, str]:
    premise = (f"An AI agent is authorized to {goal.lower()}. "
               f"The agent performs only tasks that support this goal.")
    hypothesis = f"The agent is now performing: {subtask.lower()}"
    return premise, hypothesis


def format_document(goal: str, subtask: str, decomposed: dict | None = None,
                    include_decomposed: bool = True) -> str:
    text = f"Goal: {goal}. Subtask: {subtask}."
    if include_decomposed and decomposed:
        templates = {
            "action":      "The performed action is {}.",
            "object":      "The target object is {}.",
            "scope":       "The authorization scope is {}.",
            "constraints": "The applicable constraints are {}.",
        }
        parts = [templates[k].format(decomposed[k])
                 for k in ("action", "object", "scope", "constraints")
                 if decomposed.get(k)]
        if parts:
            text += " " + " ".join(parts)
    return text
```

Rules: NLI **lowercases**; contrastive **preserves case**; the contrastive goal-side uses `format_document(goal, goal, …)`. The deployed model is the **`-raw-`** variant, so the service calls `format_document(..., include_decomposed=False)` and never passes decomposed components. (With an empty dict, `True`/`False` yield the identical raw template either way.)

---

## 5. Decision logic

```python
# NLI: p(contradiction) = scores[0]
p_contra   = float(nli_scores[0])
nli_reject = p_contra > nli_threshold

# Contrastive: cosine similarity
cos_sim    = float(np.dot(goal_emb, sub_emb))
con_reject = cos_sim < contrastive_threshold

is_rejected = nli_reject or con_reject
reasons = []
if nli_reject: reasons.append("nli_reject")
if con_reject: reasons.append("contrastive_reject")
rejection_reason = "_".join(reasons) if reasons else "accepted"   # or "both_reject"
```

- `nli_score` returned = `p_contra` (higher = more malicious).
- `contrastive_score` returned = `cos_sim` (lower = more malicious).
- Both thresholds default from `model_config.json`; both may be overridden **per request** (D1) for experiments — never persisted.

---

## 6. Project structure

```
fastapi/
├─ app/
│  ├─ main.py            # FastAPI app + lifespan (load models) + router wiring
│  ├─ config.py          # env + model_config.json loading (pydantic Settings)
│  ├─ models.py          # loaders: CrossEncoder + SentenceTransformer, fallback logic
│  ├─ preprocess.py      # format_nli, format_document (exact training parity)
│  ├─ schemas.py         # pydantic request/response models
│  ├─ service.py         # evaluate_nli(), evaluate_contrastive(), evaluate()
│  ├─ cache.py           # LRU cache for (goal, subtask, thresholds)
│  └─ routers/
│     ├─ health.py       # /health
│     ├─ models_route.py # /models
│     └─ evaluate.py     # /evaluate (+ optional /evaluate/nli, /evaluate/contrastive)
├─ tests/
│  ├─ test_preprocess.py # parity with training templates
│  ├─ test_evaluate.py   # decision logic with a stub model
│  └─ test_fallback.py   # base-model fallback when artifacts missing
├─ model_config.json     # committed artifact (§3)
├─ requirements.txt
└─ README.md
```

`requirements.txt` (added): `fastapi`, `uvicorn[standard]`, `pydantic`, `pydantic-settings`, `sentence-transformers`, `torch`, `numpy`, `datasets` (training), plus `pytest`/`httpx` for tests. `torch`/`numpy` use floors (platform-specific wheels); the rest are pinned. See the file header for the venv setup and the CPU/CUDA `--index-url` note.

---

## 7. Model loading & lifecycle

- **Lifespan startup:** load `CrossEncoder` (NLI) and `SentenceTransformer` (contrastive) into app state; then **warm up** each with one dummy inference (first call otherwise pays a large latency cost).
- **Device:** `cpu` default; `INFERENCE_DEVICE=cuda` to move models to GPU.
- **Thread safety / concurrency:** torch `encode`/`predict` are blocking and release the GIL only partially. Wrap calls in `await asyncio.to_thread(...)` and guard with a `asyncio.Semaphore(INFERENCE_MAX_CONCURRENCY)` (default = cpu count) so one request can't starve others.
- **Sequential vs parallel:** NLI and contrastive can run concurrently via `asyncio.gather(to_thread(nli), to_thread(con))`, bounded by the semaphore.
- **Readiness:** `/health` reports whether both models are loaded and their resolved versions.

---

## 8. Routes to expose

| Method | Path | Purpose | Priority |
| --- | --- | --- | --- |
| GET | `/health` | Liveness + models loaded + versions. | required |
| GET | `/models` | Model info: versions, thresholds, decision rules, metrics (read-only). Consumed by Express for the console's "Model info". | required |
| POST | `/evaluate` | Run **both** models → scores + decision. | required |
| POST | `/evaluate/nli` | NLI only (granular/debug). | optional |
| POST | `/evaluate/contrastive` | Contrastive only (granular/debug). | optional |
| GET | `/metrics` | Prometheus metrics (latency, counts). | later |

> The **only** route Express depends on is `POST /evaluate`; `/health` and `/models` are used for readiness and the read-only model-info surface.

---

## 9. Contract: `POST /evaluate`

**Request**
```jsonc
{
  "goal": "summarize a document",
  "subtask": "read the public API docs",
  "decomposed": { "action": null, "object": null, "scope": null, "constraints": null }, // optional
  "nli_threshold": 0.62,          // optional override (experimental, not persisted)
  "contrastive_threshold": 0.58   // optional override
}
```

**Response 200**
```jsonc
{
  "nli": {
    "score": 0.12,                       // = p(contradiction)  (higher = more malicious)
    "result": false,                     // true = NLI says REJECT  (score > threshold)
    "threshold": 0.62,
    "raw_scores": { "contradiction": 0.12, "entailment": 0.85, "neutral": 0.03 }
  },
  "contrastive": {
    "score": 0.81,                       // = cosine similarity (lower = more malicious)
    "result": false,                     // true = contrastive says REJECT (score < threshold)
    "threshold": 0.58
  },
  "is_rejected": false,
  "rejection_reason": "accepted",        // nli_reject | contrastive_reject | both_reject | accepted
  "model_version": "nli=…-v1;con=…-vs0.2",
  "mock": false
}
```

Notes:
- `result` booleans here mean **REJECT** for the model (matches `evaluate_nli`/`evaluate_contrastive` in training). Express inverts them for the public API's "true = accepted" convention.
- `raw_scores` is an object keyed by label (not a positional array), so the index-order trap can't recur.
- Fields are named so Express can map them 1:1 onto the API it already promises.

---

## 10. Contract: `GET /models`

```jsonc
{
  "nli": {
    "base": "cross-encoder/nli-MiniLM2-L6-H768",
    "version": "sentinelagent-nli-3class-v1",
    "labels": ["contradiction", "entailment", "neutral"],
    "decision": "p_contradiction > threshold",
    "threshold": 0.62,
    "metrics": { "accuracy": 0.94, "tpr": 0.91, "fpr": 0.06, "f1": 0.92 }
  },
  "contrastive": {
    "base": "all-MiniLM-L12-v2",
    "version": "contrastive-minilm-…",
    "decision": "cosine < threshold",
    "threshold": 0.58,
    "metrics": { "tpr": 0.88, "fpr": 0.07, "f1": 0.89 }
  },
  "source": "model_config.json"
}
```

Express exposes this (read-only) to the console; it replaces the old editable `/api/thresholds`.

---

## 11. Performance (caching, batching, device)

- **LRU cache** on `(goal, subtask, nli_threshold, contrastive_threshold, decomposed_hash)` → response. Common goals repeat; this is the cheapest big win. Bound it (e.g. 1024 entries) and make it process-local.
- **Embedding reuse:** cache the goal-side embedding per goal (contrastive) — many subtasks share a goal.
- **Batching:** if a future route accepts batches, encode in batches (`batch_size` ~32) rather than one-by-one.
- **Warmup** at startup (see §7) and a `/health` readiness gate so Express' `/readyz` doesn't route traffic before models are loaded.
- **Timeouts:** Express enforces ~5s; keep p99 well under that. Log per-model latency so `/metrics` can track drift.
- **Quantization/ONNX** are future options (spec mentions ONNX); not needed for v1 with MiniLM-sized models.

---

## 12. Errors & health

- `422` — pydantic validation (missing/empty/oversized goal/subtask; threshold outside `(0,1)`).
- `503` — models not loaded yet (before warmup completes).
- `500` — inference error (returned with a request id; Express maps to `INFERENCE_UNAVAILABLE`/`INTERNAL`).
- **`GET /health`** → `{ "status": "ok", "nli_loaded": true, "contrastive_loaded": true, "nli_version": "…", "contrastive_version": "…", "device": "cpu" }`; `503` if not ready. Express' `/readyz` pings this.

---

## 13. Testing

- **Preprocessing parity:** assert `format_nli`/`format_document` outputs equal the exact strings from the training scripts (golden tests) — this is the highest-value test, since a template drift silently breaks accuracy.
- **Decision logic:** inject a stub model returning fixed scores; assert reject/accept for NLI-only, contrastive-only, both, neither, and the `_`-joined reason strings.
- **Label order:** a test that feeds a known contradiction and asserts `raw_scores["contradiction"]` is the largest — guards the index-0 invariant.
- **Fallback:** with `MODELS_DIR` empty, assert the service starts on base models and marks `version: "base"`.
- **Contract test:** `POST /evaluate` response validates against the pydantic schema Express expects.

---

## 14. Deployment

- Run under `uvicorn` with `--workers 1` (models are large; scale by replicas, not workers, to avoid loading N copies per process) — or 1 worker + internal threads.
- Ship/mount the fine-tuned model dirs and `model_config.json` alongside the image; or pull from HF hub.
- Pre-download models at build time so cold starts don't fetch weights.
- Health/readiness wired to `/health` for the platform and for Express' `/readyz`.

---

## 15. Milestones

**F1 — Skeleton + config**
1. `config.py` (env + `model_config.json`), `schemas.py`, `main.py` + lifespan.
2. `models.py` with base-model loading + fallback; `/health`.

**F2 — Preprocessing + service**
3. `preprocess.py` (training parity) + golden tests.
4. `service.py` (`evaluate_nli`, `evaluate_contrastive`, `evaluate`) + decision logic tests.

**F3 — Routes**
5. `POST /evaluate` (with overrides + cache); `GET /models`.
6. Optional `/evaluate/nli`, `/evaluate/contrastive`.

**F4 — Integration**
7. Wire `inference.client.js` in Express to this service; verify end-to-end against mock.
8. `/metrics` (optional) + deployment packaging.

---

## 16. Decisions & open questions

### Decisions (locked)

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Threshold exposure | Read-only defaults from `model_config.json` + **experimental per-request override** (not persisted). |
| D2 | NLI decision | **F1-tuned probability threshold** on `p(contradiction)` (symmetric with contrastive). |
| D3 | Threshold/model source | **Committed `model_config.json`** artifact. |
| D4 | Missing artifacts | **Fall back to base pretrained models**. |
| D5 | Runtime versions | **`sentence-transformers==5.5.0`** + `transformers==5.8.1` — matches the env that produced the `.models/` checkpoints. |

### Open questions

- **Q1 — NLI threshold generation.** *Resolved:* `sentinelagent_nli_finetune.py` now sweeps `p(contradiction)` (F1-optimal) per CV fold and writes `logs/nli_cv_results.json` with `recommended_nli_threshold` (mean across folds). Feed that into `model_config.json`'s `nli.threshold`.
- **Q2 — Decomposed input.** v1 sends `{}` (matches training). Is there a DeBERTa/spaCy decomposition step to wire later? *Deferred.*
- **Q3 — Base-vs-fine-tuned policy in prod.** Fallback is dev-friendly; should prod **refuse** to serve `version: "base"`? *Proposed: warn + serve, flag in response.*
- **Q4 — Where `model_config.json` lives.** Shipped in the image vs mounted vs fetched from Express. *Proposed: committed in `fastapi/`, shipped in the image.*
- **Q5 — Concurrency limit.** Default `INFERENCE_MAX_CONCURRENCY`; CPU-only host unknown. *Proposed: `cpu_count()`.*
- **Q6 — Batching.** Needed for v1? *Proposed: no; single-pair with cache.*

---

## 17. Appendix

### 17.1 Reference implementation (sketch)

```python
# app/service.py
import numpy as np
from app.preprocess import format_nli, format_document

def evaluate_nli(cross_encoder, goal, subtask, threshold):
    premise, hypothesis = format_nli(goal, subtask)
    scores = cross_encoder.predict([(premise, hypothesis)])[0]   # [contra, entail, neutral]
    p_contra = float(scores[0])
    return {
        "score": p_contra,
        "result": p_contra > threshold,
        "threshold": threshold,
        "raw_scores": {
            "contradiction": float(scores[0]),
            "entailment":    float(scores[1]),
            "neutral":       float(scores[2]),
        },
    }

def evaluate_contrastive(model, goal, subtask, threshold, decomposed=None):
    goal_text = format_document(goal, goal, decomposed)
    sub_text  = format_document(goal, subtask, decomposed)
    goal_emb  = model.encode(goal_text, normalize_embeddings=True)
    sub_emb   = model.encode(sub_text,  normalize_embeddings=True)
    cos_sim   = float(np.dot(goal_emb, sub_emb))
    return {"score": cos_sim, "result": cos_sim < threshold, "threshold": threshold}
```

### 17.2 Config env vars

```dotenv
MODELS_DIR=.                      # resolves model_dir entries in model_config.json
MODEL_CONFIG_PATH=model_config.json
INFERENCE_DEVICE=cpu              # cpu | cuda
INFERENCE_MAX_CONCURRENCY=4
CACHE_SIZE=1024
```

### 17.3 Training-code parity checklist

- [ ] NLI premise/hypothesis strings byte-identical (including `.lower()` and the trailing period).
- [ ] NLI label order `[contradiction, entailment, neutral]`.
- [ ] Contrastive uses `format_document` on **both** sides (goal side uses `goal, goal`).
- [ ] `normalize_embeddings=True` + dot product (== cosine).
- [ ] Contrastive preserves original casing; NLI lowercases.
- [ ] Decision rules: `p_contra > t` (NLI), `cos < t` (contrastive), OR-combined.
