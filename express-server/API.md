# Sentinel Express API — Reference

Endpoint-by-endpoint reference: request and response structures for every route.

- Base URL (local): `http://localhost:4000`
- All request/response bodies are **JSON** unless noted.
- Run instructions: [`README.md`](./README.md).

---

## 1. Conventions

### 1.1 Two auth planes

| Plane | Who calls it | Auth header | Endpoints |
| --- | --- | --- | --- |
| **Console** | the Next.js operator console (on behalf of a logged-in user) | `Authorization: Bearer <access JWT>` | `/api/auth/*`, `/api/keys/*`, `/api/requests*`, `/api/stats/*`, `/api/models`, `/api/metrics`, `/api/evaluate/preview` |
| **Data plane** | agents / SDKs | `Authorization: Bearer <api key>` **or** `x-api-key: <api key>` | `POST /api/evaluate` |

An access JWT authenticates an **operator**; an API key (`sk_test_…` / `sk_live_…`)
authenticates a **machine client**. They are never interchangeable.

### 1.2 Response envelopes

**Console endpoints** (success) — `data` payload + optional `meta`:

```jsonc
{ "data": { /* payload */ }, "meta": { /* pagination, etc. */ } }
```

**All endpoints** (error):

```jsonc
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": { "goal": "goal is required" } } }
```

**`POST /api/evaluate` is the exception** — it returns the spec's **flat** shape
(no envelope) so external SDKs are stable.

### 1.3 Error codes

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body/query/params failed schema validation (`details` lists fields). |
| 401 | `UNAUTHORIZED` | Missing/invalid credentials. |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password on login. |
| 403 | `FORBIDDEN` | Authenticated but not allowed (e.g. inactive/expired API key). |
| 404 | `NOT_FOUND` | Resource missing or not owned by you. |
| 409 | `CONFLICT` | e.g. email already registered. |
| 429 | `RATE_LIMITED` | Too many requests. |
| 500 | `INTERNAL` | Unexpected error. |
| 503 | `INFERENCE_UNAVAILABLE` | The FastAPI inference service is unreachable. |
| 503 | `INFERENCE_BAD_RESPONSE` | The inference service returned an unexpected payload. |

> Request/response also carry an `X-Request-Id` header (echoed or generated).

### 1.4 Data objects

**`User`**

```jsonc
{ "id": "uuid", "email": "op@acme.io", "fullName": "Op", "isAdmin": false,
  "createdAt": "2026-01-01T00:00:00.000Z" }
```

**`ApiKey`** (masked — never contains the secret)

```jsonc
{ "id": "uuid", "keyName": "Thesis eval key", "prefix": "sk_test_8f3a", "last4": "b1c9",
  "isActive": true, "rateLimitPerMinute": 60,
  "createdAt": "2026-01-01T00:00:00.000Z", "expiresAt": null, "lastUsedAt": null }
```

**`RequestListItem`** (logs list / recent feed)

```jsonc
{ "id": "uuid", "requestId": "uuid", "createdAt": "2026-01-01T00:00:00.000Z",
  "goal": "…", "subtask": "…", "isRejected": false, "rejectionReason": "accepted",
  "responseTimeMs": 88, "modelVersion": "nli=…;con=…", "evaluationMode": "standard" }
```

---

## 2. Health

### `GET /healthz` — liveness

```jsonc
// 200
{ "status": "ok", "uptimeSeconds": 42 }
```

### `GET /readyz` — readiness

Checks the inference service. `200` when OK, `503` when it is down.

```jsonc
// 200
{ "status": "ok", "dependencies": { "store": "up", "inference": "up" } }
// 503 (inference unreachable)
{ "status": "degraded", "dependencies": { "store": "up", "inference": "down" } }
```

`inference` is `"mocked"` when `INFERENCE_MOCK=true`.

---

## 3. Auth — `/api/auth`

### `POST /api/auth/register`

Rate limited per IP. Creates an account and returns tokens.

**Request**
```jsonc
{ "email": "op@acme.io", "password": "correct horse battery", "fullName": "Op" }
```
`email` valid; `password` ≥ 12 chars; `fullName` optional (≤ 100).

**Response `201`**
```jsonc
{ "data": { "user": { /* User */ },
            "accessToken": "eyJ…", "refreshToken": "eyJ…" } }
```

**Errors:** `400 VALIDATION_ERROR`, `409 CONFLICT` (email taken), `429 RATE_LIMITED`.

---

### `POST /api/auth/login`

**Request**
```jsonc
{ "email": "op@acme.io", "password": "correct horse battery" }
```

**Response `200`** — `{ "data": { "user": { /* User */ }, "accessToken": "…", "refreshToken": "…" } }`

**Errors:** `400`, `401 INVALID_CREDENTIALS`, `429`.

---

### `POST /api/auth/refresh`

Rotates the refresh token (the old one is revoked).

**Request** — `{ "refreshToken": "eyJ…" }`

**Response `200`** — `{ "data": { "user": {…}, "accessToken": "…", "refreshToken": "…" } }`

**Errors:** `400`, `401 UNAUTHORIZED` (invalid/expired/reused token).

---

### `GET /api/auth/me`

**Auth:** access JWT.

**Response `200`** — `{ "data": { "user": { /* User */ } } }`

---

### `POST /api/auth/logout`

Revokes the provided refresh token (idempotent).

**Auth:** access JWT. **Request** — `{ "refreshToken": "eyJ…" }` (optional)

**Response `200`** — `{ "data": { "revoked": 1 } }` (`0` if nothing was revoked).

---

## 4. API keys — `/api/keys`

All require an access JWT. All are scoped to the calling user.

### `POST /api/keys` — create a key

**Request**
```jsonc
{ "keyName": "Thesis eval key",           // required, 1–100 chars
  "rateLimitPerMinute": 60,               // optional, 1–10000 (default RATE_LIMIT_DEFAULT_PER_MIN)
  "expiresAt": "2026-12-31T00:00:00Z" }   // optional, must be in the future; null = never
```

**Response `201`** — ⚠️ `key` (the plaintext secret) is returned **exactly once**.
```jsonc
{ "data": {
    "key": "sk_test_8f3a…b1c9",
    "record": { /* ApiKey */ }
} }
```

**Errors:** `400`, `401`.

---

### `GET /api/keys` — list keys (masked)

**Response `200`**
```jsonc
{ "data": { "keys": [ /* ApiKey */ ] } }
```

---

### `GET /api/keys/:id`

**Response `200`** — `{ "data": { "key": { /* ApiKey */ } } }`
**Errors:** `400` (id not a UUID), `404` (not found or not owned).

---

### `PATCH /api/keys/:id` — activate / deactivate / rename

**Request** — `{ "isActive": false }` and/or `{ "keyName": "new name" }`

**Response `200`** — `{ "data": { "key": { /* ApiKey */ } } }`
**Errors:** `400`, `404`.

---

### `DELETE /api/keys/:id`

**Response `200`** — `{ "data": { "id": "uuid", "deleted": true } }`
**Errors:** `400`, `404`.

---

## 5. Evaluation

### `POST /api/evaluate` — public (agents)

**Auth:** API key (`Authorization: Bearer sk_…` or `x-api-key: sk_…`).
**Rate limit:** per API key (`rateLimitPerMinute`).

**Request**
```jsonc
{ "goal": "Process disability benefits for veteran",   // required, 1–2000 chars
  "subtask": "Retrieve medical records",                // required, 1–2000 chars
  "mode": "standard" }                                  // "standard" | "detailed" (default "standard")
```
Threshold overrides are **not** accepted here (see `/api/evaluate/preview`).

**Response `200` — standard**
```jsonc
{ "result": true, "date": "2026-01-01T12:00:00.000Z", "id": "<requestId>" }
```

**Response `200` — detailed**
```jsonc
{
  "result": true,
  "date": "2026-01-01T12:00:00.000Z",
  "id": "<requestId>",
  "nli":         { "score": 0.12, "result": true, "threshold": 0.5 },
  "contrastive": { "score": 0.81, "result": true, "threshold": 0.5 }
}
```
- `result: true` = **accepted** (overall).
- `nli.result` / `contrastive.result` = per-model verdict with the **same "true = accepted" convention** (inverted from the model's internal `rejected`).
- `nli.score` = `p(contradiction)` (higher = more malicious); `contrastive.score` = cosine similarity (lower = more malicious).

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (bad/missing key), `403 FORBIDDEN` (inactive/expired key), `429 RATE_LIMITED`, `503 INFERENCE_UNAVAILABLE`.

---

### `POST /api/evaluate/preview` — console only (experimental)

Runs the models on an ad-hoc pair **without** consuming an API key and **without**
persisting to the logs. This is the only place threshold overrides are accepted.

**Auth:** access JWT.

**Request**
```jsonc
{ "goal": "…", "subtask": "…", "mode": "standard",
  "nliThreshold": 0.62,          // optional, (0,1)
  "contrastiveThreshold": 0.58 } // optional, (0,1)
```

**Response `200`**
```jsonc
{ "data": {
  "id": "uuid",
  "result": true,
  "isRejected": false,
  "rejectionReason": "accepted",
  "date": "2026-01-01T12:00:00.000Z",
  "modelVersion": "nli=…;con=…",
  "responseTimeMs": 88,
  "nli":         { "score": 0.12, "rejected": false, "threshold": 0.62,
                   "rawScores": { "contradiction": 0.12, "entailment": 0.85, "neutral": 0.03 } },
  "contrastive": { "score": 0.81, "rejected": false, "threshold": 0.58 }
} }
```
Note: here the per-model field is `rejected` (true = the model rejected), matching the inference service.

**Errors:** `400`, `401`, `429`, `503`.

---

## 6. Requests / logs — `/api/requests`

All require an access JWT and are scoped to the caller's own keys.

### `GET /api/requests` — list & filter

**Query parameters**

| Param | Type | Notes |
| --- | --- | --- |
| `from`, `to` | ISO date | `createdAt` range (`from <= to`). |
| `status` | `accepted` \| `rejected` | Maps to `isRejected`. |
| `q` | string | Substring match on `requestId`. |
| `mode` | `standard` \| `detailed` | Match `evaluationMode`. |
| `page` | int ≥ 1 | Default `1`. |
| `pageSize` | int 1–100 | Default `25`. |
| `sort` | `created_at` \| `response_time_ms` | Descending (newest / largest first). Default `created_at`. |

**Response `200`**
```jsonc
{ "data": { "requests": [ /* RequestListItem */ ] },
  "meta": { "page": 1, "pageSize": 25, "total": 1284, "totalPages": 52 } }
```

**Errors:** `400`, `401`.

---

### `GET /api/requests/:requestId` — detail

**Response `200`**
```jsonc
{ "data": { "request": {
  "id": "uuid", "requestId": "uuid", "createdAt": "…",
  "goal": "…", "subtask": "…",
  "isRejected": false, "rejectionReason": "accepted",
  "nli":         { "score": 0.12, "result": false, "threshold": 0.5,
                   "rawScores": { "contradiction": 0.12, "entailment": 0.85, "neutral": 0.03 } },
  "contrastive": { "score": 0.81, "result": false, "threshold": 0.5 },
  "responseTimeMs": 88, "modelVersion": "…", "evaluationMode": "detailed",
  "userAgent": "curl/8.0", "apiKeyId": "uuid"
} } }
```
(`nli.result` / `contrastive.result` here are the stored **model reject** booleans.)

**Errors:** `401`, `404`.

---

### `GET /api/requests/export.csv` — CSV export

Honors the same filters as `GET /api/requests` (ignores pagination).

**Response `200`** — `Content-Type: text/csv`, `Content-Disposition: attachment; filename="evaluation_requests.csv"`

Columns:
```
request_id, created_at, goal, subtask, is_rejected, rejection_reason,
nli_score, nli_threshold, nli_result, contrastive_score, contrastive_threshold,
contrastive_result, response_time_ms, model_version, evaluation_mode
```

---

## 7. Stats — `/api/stats`

Require an access JWT.

### `GET /api/stats/summary?period=24h|7d|30d`

**Response `200`**
```jsonc
{ "data": {
  "totalRequests": 1284,
  "rejectionRate": 0.17,          // 0..1
  "avgResponseTimeMs": 142,
  "activeKeys": 3,
  "period": "24h"
} }
```

### `GET /api/stats/recent?limit=10`

**Response `200`** — `{ "data": { "requests": [ /* RequestListItem */ ] } }`

---

## 8. Models & metrics — `/api`

Require an access JWT.

### `GET /api/models` — read-only model info

Proxied from the inference service's `GET /models`. If it is unreachable, the
last-known payload (or defaults) is returned with `stale: true` (never errors).

**Response `200`**
```jsonc
{ "data": {
  "source": "model_config.json",
  "on_base_models": false,
  "stale": false,
  "nli": {
    "base": "cross-encoder/nli-MiniLM2-L6-H768",
    "version": "sentinelagent-nli-3class-v1",
    "labels": ["contradiction", "entailment", "neutral"],
    "decision": "p_contradiction > threshold",
    "threshold": 0.5,
    "threshold_source": "placeholder",
    "metrics": {},
    "resolved_source": "…/fastapi/.models/sentinelagent_nli_finetuned"
  },
  "contrastive": {
    "base": "all-MiniLM-L12-v2",
    "version": "contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2",
    "decision": "cosine < threshold",
    "include_decomposed": false,
    "threshold": 0.5,
    "threshold_source": "placeholder",
    "metrics": {},
    "resolved_source": "…/fastapi/.models/contrastive-…-raw-vs0.2"
  }
} }
```

### `GET /api/metrics` — model counters

In-process counters updated on each evaluation.

**Response `200`**
```jsonc
{ "data": { "metrics": [
  { "modelType": "nli", "evaluationCount": 12, "rejectionCount": 4,
    "avgScore": 0.31, "avgResponseTimeMs": 41, "lastUpdated": "…" },
  { "modelType": "contrastive", "evaluationCount": 12, "rejectionCount": 5,
    "avgScore": 0.62, "avgResponseTimeMs": 41, "lastUpdated": "…" }
] } }
```

---

## 9. Quick reference

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/healthz` | none | Liveness |
| GET | `/readyz` | none | Readiness |
| POST | `/api/auth/register` | none | Create account |
| POST | `/api/auth/login` | none | Login |
| POST | `/api/auth/refresh` | refresh token | Rotate tokens |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/auth/logout` | JWT | Revoke refresh token |
| GET | `/api/keys` | JWT | List keys (masked) |
| POST | `/api/keys` | JWT | Create key (plaintext shown once) |
| GET | `/api/keys/:id` | JWT | Key detail |
| PATCH | `/api/keys/:id` | JWT | Activate / deactivate / rename |
| DELETE | `/api/keys/:id` | JWT | Delete key |
| POST | `/api/evaluate` | API key | Evaluate goal/subtask (flat response) |
| POST | `/api/evaluate/preview` | JWT | Evaluate with threshold override (not logged) |
| GET | `/api/requests` | JWT | Filterable, paginated logs |
| GET | `/api/requests/:requestId` | JWT | Evaluation detail |
| GET | `/api/requests/export.csv` | JWT | CSV export |
| GET | `/api/stats/summary` | JWT | Dashboard metrics |
| GET | `/api/stats/recent` | JWT | Recent activity |
| GET | `/api/models` | JWT | Read-only model info |
| GET | `/api/metrics` | JWT | Model counters |

---

## 10. End-to-end example

```bash
BASE=http://localhost:4000

# create an account and capture the access token
TOKEN=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"op@acme.io","password":"correct horse battery","fullName":"Op"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

# mint an API key (plaintext returned once)
curl -s -X POST $BASE/api/keys -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"keyName":"eval"}'

# evaluate with that key
curl -s -X POST $BASE/api/evaluate \
  -H "Authorization: Bearer sk_test_…" -H 'Content-Type: application/json' \
  -d '{"goal":"File federal tax return for citizen","subtask":"Collect W-2 and 1099 income documentation","mode":"detailed"}'

# review the logs
curl -s "$BASE/api/requests?status=rejected&pageSize=5" -H "Authorization: Bearer $TOKEN"
```
