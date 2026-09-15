# Sentinel Inference Service (FastAPI)

Dual-model security evaluation. Given a **goal** and a **subtask**, it decides
whether the subtask is aligned with the authorized goal, using two fine-tuned
MiniLM models:

| Model | Type | Base | Decision |
| --- | --- | --- | --- |
| **NLI** | cross-encoder | `cross-encoder/nli-MiniLM2-L6-H768` | reject when `p(contradiction) > threshold` |
| **Contrastive** | bi-encoder | `all-MiniLM-L12-v2` | reject when `cosine_similarity < threshold` |

**Overall rule: reject if EITHER model rejects.**

- Interactive API docs: `http://localhost:8000/docs` (Swagger UI) and `/openapi.json`.
- Base URL (local): `http://localhost:8000`

---

## 1. Install & run

```bash
cd fastapi

python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt

# start the server (loads both models at startup)
uvicorn app.main:app --reload --port 8000
```

> **torch >= 2.11 is required** — transformers 5.8.1 fails on older torch
> (verified failing on 2.4.1, working on 2.14.0). If the default wheel is wrong
> for your machine, install the matching build first:
> `pip install torch --index-url https://download.pytorch.org/whl/cpu` (or `/cu124`).

The service loads the fine-tuned checkpoints from `fastapi/.models/` and warms
them up at startup. Confirm readiness:

```bash
curl http://localhost:8000/health
```

---

## 2. Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/evaluate` | Evaluate a `goal` + `subtask` pair. |
| `GET` | `/health` | Liveness / readiness (models loaded?). |
| `GET` | `/models` | Read-only model info (versions, thresholds, metrics). |
| `GET` | `/docs` | Swagger UI. |

---

## 3. `POST /evaluate`

### 3.1 Request body

`Content-Type: application/json`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `goal` | string | **yes** | 1–2000 chars. The authorized root goal. |
| `subtask` | string | **yes** | 1–2000 chars. The subtask to verify. |
| `nli_threshold` | float | no | `(0,1)` override; defaults to the trained threshold. |
| `contrastive_threshold` | float | no | `(0,1)` override; defaults to the trained threshold. |

```json
{
  "goal": "Process disability benefits for veteran",
  "subtask": "Retrieve the veteran's medical records from the VA health system"
}
```

> The goal/subtask are lowercased internally for the NLI model and used verbatim
> for the contrastive model — you send them as-is.

### 3.2 Response body (`200`)

```json
{
  "request_id": "3f2b1c9e-5a4d-4c1b-9f7e-2d6a8b0c1e2f",
  "timestamp": "2026-04-20T12:00:00.123456+00:00",
  "goal": "Process disability benefits for veteran",
  "subtask": "Retrieve the veteran's medical records from the VA health system",
  "result": true,
  "is_rejected": false,
  "rejection_reason": "accepted",
  "model_version": "nli=sentinelagent-nli-3class-v1;con=contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2",
  "nli": {
    "score": 0.12,
    "threshold": 0.5,
    "rejected": false,
    "margin": -0.38,
    "raw_scores": { "contradiction": 0.12, "entailment": 0.85, "neutral": 0.03 },
    "latency_ms": 12.3
  },
  "contrastive": {
    "score": 0.81,
    "threshold": 0.5,
    "rejected": false,
    "margin": 0.31,
    "latency_ms": 8.1
  },
  "statistics": {
    "total_latency_ms": 20.4,
    "nli_latency_ms": 12.3,
    "contrastive_latency_ms": 8.1,
    "decision_rule": "reject if either model rejects",
    "rejecting_models": [],
    "nli_threshold": 0.5,
    "contrastive_threshold": 0.5,
    "cached": false
  }
}
```

### 3.3 Field reference

**Top level**

| Field | Type | Meaning |
| --- | --- | --- |
| `request_id` | string (UUID) | Unique id for this call. |
| `timestamp` | string (ISO-8601, UTC) | Server time of the response. |
| `goal`, `subtask` | string | Echo of the inputs. |
| `result` | boolean | **`true` = accepted** (spec convention). |
| `is_rejected` | boolean | `!result`. |
| `rejection_reason` | string | `accepted` \| `nli_reject` \| `contrastive_reject` \| `both_reject`. |
| `model_version` | string | `nli=<v1>;con=<v2>`. |

**`nli` (cross-encoder)**

| Field | Type | Meaning |
| --- | --- | --- |
| `score` | float | `p(contradiction)` ∈ [0,1]; **higher = more malicious**. |
| `threshold` | float | Threshold applied. |
| `rejected` | boolean | `score > threshold`. |
| `margin` | float | `score - threshold` (positive ⇒ rejected). |
| `raw_scores` | object | Softmaxed probabilities: `contradiction`, `entailment`, `neutral`. |
| `latency_ms` | float | Model wall-clock time. |

**`contrastive` (bi-encoder)**

| Field | Type | Meaning |
| --- | --- | --- |
| `score` | float | Cosine similarity ∈ [-1,1]; **lower = more malicious**. |
| `threshold` | float | Threshold applied. |
| `rejected` | boolean | `score < threshold`. |
| `margin` | float | `score - threshold` (negative ⇒ rejected). |
| `latency_ms` | float | Model wall-clock time. |

**`statistics` (per-request metrics)**

| Field | Type | Meaning |
| --- | --- | --- |
| `total_latency_ms` | float | `nli_latency_ms + contrastive_latency_ms`. |
| `nli_latency_ms`, `contrastive_latency_ms` | float | Per-model latency. |
| `decision_rule` | string | How the two verdicts are combined. |
| `rejecting_models` | string[] | `[]`, `["nli"]`, `["contrastive"]`, or both. |
| `nli_threshold`, `contrastive_threshold` | float | Thresholds actually used. |
| `cached` | boolean | `true` when served from the LRU cache. |

### 3.4 Examples

**curl**

```bash
curl -X POST http://localhost:8000/evaluate \
  -H "Content-Type: application/json" \
  -d '{
        "goal": "Process disability benefits for veteran",
        "subtask": "Transfer the veteran's financial records to a collection agency"
      }'
```

**Python**

```python
import requests

resp = requests.post(
    "http://localhost:8000/evaluate",
    json={
        "goal": "Process disability benefits for veteran",
        "subtask": "Retrieve the veteran's medical records from the VA health system",
    },
    timeout=30,
)
resp.raise_for_status()
data = resp.json()
print(data["is_rejected"], data["rejection_reason"], data["statistics"])
```

### 3.5 Errors

| Status | When | Body |
| --- | --- | --- |
| `422` | Missing/empty/oversized `goal`/`subtask`; threshold outside `(0,1)`. | FastAPI validation detail. |
| `503` | Models not loaded (start-up failure). | `{"detail": "Models are not loaded yet"}`. |
| `500` | Unexpected inference error. | `{"detail": "Internal Server Error"}`. |

---

## 4. `GET /health`

`200` when the models are loaded, `503` otherwise.

```json
{
  "status": "ok",
  "ready": true,
  "nli_loaded": true,
  "contrastive_loaded": true,
  "on_base_models": false,
  "device": "cpu",
  "nli_version": "sentinelagent-nli-3class-v1",
  "contrastive_version": "contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2",
  "model_error": null
}
```

`on_base_models: true` means a fine-tuned checkpoint was missing and the base
pretrained model was used (dev fallback). `model_error` is set when loading
failed entirely.

---

## 5. `GET /models`

Read-only model info sourced from `model_config.json` (versions, decision rules,
thresholds, reference metrics).

```json
{
  "source": "model_config.json",
  "on_base_models": false,
  "nli": {
    "base": "cross-encoder/nli-MiniLM2-L6-H768",
    "version": "sentinelagent-nli-3class-v1",
    "labels": ["contradiction", "entailment", "neutral"],
    "decision": "p_contradiction > threshold",
    "threshold": 0.5,
    "threshold_source": "placeholder",
    "resolved_source": "/abs/path/fastapi/.models/sentinelagent_nli_finetuned"
  },
  "contrastive": {
    "base": "all-MiniLM-L12-v2",
    "version": "contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2",
    "decision": "cosine < threshold",
    "include_decomposed": false,
    "threshold": 0.5,
    "threshold_source": "placeholder",
    "resolved_source": "/abs/path/fastapi/.models/contrastive-…-raw-vs0.2"
  }
}
```

---

## 6. Configuration

Environment variables (optionally via `fastapi/.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODELS_DIR` | `fastapi/.models` | Directory holding the fine-tuned model folders. |
| `MODEL_CONFIG_PATH` | `fastapi/model_config.json` | Model/threshold config. |
| `INFERENCE_DEVICE` | `cpu` | `cpu` or `cuda`. |
| `INFERENCE_MAX_CONCURRENCY` | CPU count | Max concurrent inferences. |
| `CACHE_SIZE` | `1024` | LRU cache entries (`0` disables). |

---

## 7. Behavior notes

- **NLI returns logits.** The shipped checkpoint sets
  `activation_fn = Identity`, so the service applies **softmax** before
  thresholding and before reporting `score`/`raw_scores`. `raw_scores` is keyed
  by label (`contradiction` is index 0) — never rely on positional order.
- **Contrastive is the `-raw-` variant.** It was trained on the raw
  `"Goal: …. Subtask: …."` template only, so no decomposition input is used.
- **Thresholds are placeholders** until training writes
  `logs/nli_cv_results.json` / `logs/contrastive_cv_results.json`. Override them
  per request (see §3.1) or edit `model_config.json`.
- **Caching & concurrency.** Identical `(goal, subtask, thresholds)` are served
  from an LRU cache (`cached: true`). The two models run concurrently in worker
  threads, bounded by `INFERENCE_MAX_CONCURRENCY`.
- **Fallback.** If a fine-tuned dir is missing, the base pretrained model is used
  and `/health` reports `on_base_models: true`.

---

## 8. Project layout

```
fastapi/
├─ app/
│  ├─ main.py            # FastAPI app + lifespan (loads models)
│  ├─ config.py          # env settings + model_config.json loader
│  ├─ preprocess.py      # training-parity text formatting
│  ├─ models.py          # model loading + base-model fallback
│  ├─ service.py         # pure inference logic (softmax, NLI, contrastive, decision)
│  ├─ cache.py           # thread-safe LRU cache
│  ├─ schemas.py         # pydantic request/response models
│  └─ routers/
│     ├─ evaluate.py     # POST /evaluate
│     ├─ health.py       # GET /health
│     └─ models_info.py  # GET /models
├─ .models/              # fine-tuned checkpoints (git-ignored weights)
├─ model_config.json     # model dirs, versions, thresholds
├─ requirements.txt
└─ old-training/         # the scripts that produced the models
```
