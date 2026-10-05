# Sentinel — System Architecture & Pipeline

> **Status:** describes the system **as built today** (commit `8fbed3d`), plus the deltas from the
> original spec. Everything below is verified against the code in this repo.
>
> **Companion docs:** [`full_plan.md`](./full_plan.md) (original thesis spec) ·
> [`sentinel-client/plan.md`](./sentinel-client/plan.md) ·
> [`express-server/plan.md`](./express-server/plan.md) + [`express-server/API.md`](./express-server/API.md) ·
> [`fastapi/plan.md`](./fastapi/plan.md) + [`fastapi/README.md`](./fastapi/README.md)
>
> **For chart generation:** §3 (top-level flow), §7 (pipelines), §8 (inference decision) each carry a
> Mermaid diagram **and** a plain node/edge list. §14 is a single machine-readable graph spec.

---

## Table of contents

1. [What the system does](#1-what-the-system-does)
2. [Actors and trust boundaries](#2-actors-and-trust-boundaries)
3. [Top-level architecture](#3-top-level-architecture)
4. [Runtime topology](#4-runtime-topology)
5. [Component inventory](#5-component-inventory)
6. [API surface](#6-api-surface)
7. [Pipelines](#7-pipelines)
8. [Inference internals](#8-inference-internals)
9. [Data model](#9-data-model)
10. [Security model](#10-security-model)
11. [Configuration matrix](#11-configuration-matrix)
12. [Current vs. planned](#12-current-vs-planned)
13. [Gaps and next steps](#13-gaps-and-next-steps)
14. [Machine-readable graph spec](#14-machine-readable-graph-spec)

---

## 1. What the system does

Sentinel is a **security gateway for autonomous agents**. Before an agent performs a subtask, it
submits the subtask (and the goal it was authorized to pursue) to Sentinel. Two independently
fine-tuned MiniLM models each score the pair, and **if either model rejects, the subtask is
blocked**. Every decision is logged with the scores that produced it.

- **NLI cross-encoder** — does the subtask *contradict* the authorized goal?
- **Contrastive bi-encoder** — is the subtask *semantically close* to the goal?
- **Overall rule:** `reject if EITHER model rejects`.

Three deployable pieces:

| Piece | Role | Stack |
| --- | --- | --- |
| `sentinel-client` | Marketing site + operator console | Next.js 16 (App Router), React 19, Tailwind v4, daisyUI 5 |
| `express-server` | API gateway: auth, API keys, rate limits, logging, stats, inference proxy | Node 25, Express 5 (CommonJS) |
| `fastapi` | Model inference service (the only place models run) | Python 3.12, FastAPI, sentence-transformers 5.5.0, torch 2.14 |

---

## 2. Actors and trust boundaries

| Actor | Plane | Credential | Reaches |
| --- | --- | --- | --- |
| **Agent / SDK** (machine client) | **Data plane** | API key `sk_test_…` / `sk_live_…` | `POST /api/evaluate` only |
| **Operator** (human, via console) | **Console plane** | JWT access token (Bearer) | `/api/auth/*`, `/api/keys/*`, `/api/requests*`, `/api/stats/*`, `/api/models`, `/api/metrics`, `/api/evaluate/preview` |
| **Anonymous visitor** | Public | none | `GET /`, `POST /api/playground` (server-side key) |

**Trust boundaries**

1. **Browser → Next server**: no credential crosses this line. The playground's API key lives in the
   Next server's environment (`SENTINEL_API_KEY`), never in client JS.
2. **Next server → Express**: Bearer API key (server-held).
3. **Express → FastAPI**: unauthenticated, network-local. FastAPI is assumed reachable only from
   Express (bind to localhost / private network).
4. **Express → data store**: a local SQLite database (file-backed, `better-sqlite3`); the seam is `src/store/index.js`.

---

## 3. Top-level architecture

```mermaid
flowchart LR
  subgraph clients["Clients"]
    AG["Agent / SDK"]
    BR["Browser"]
  end

  subgraph next["sentinel-client (Next.js 16) — :3000"]
    LAND["/ — landing page<br/>(hero · capabilities · chatbot · API)"]
    PGROUTE["/api/playground<br/>(route handler, server-side key)"]
    CHAT["/api/chat<br/>(route handler, server-side key)"]
  end

  DS["DeepSeek API<br/>(goal generation)"]

  subgraph gw["express-server (Express 5) — :4000"]
    MW["middleware<br/>helmet · cors · json · requestId · logger"]
    AUTHZ["requireConsoleAuth (JWT)"]
    APIKEY["requireApiKey (sk_…)"]
    RATE["rate limiters"]
    VAL["zod validate"]
    SVC["services"]
    STORE[("SQLite<br/>users · apiKeys · requests<br/>refreshTokens · modelMetrics")]
    INF["inference.client"]
  end

  subgraph inf["fastapi — :8000"]
    EVAL["POST /evaluate"]
    NLI["NLI cross-encoder"]
    CON["contrastive bi-encoder"]
    CFG["model_config.json"]
  end

  BR --> LAND
  BR -->|"POST /api/playground"| PGROUTE
  BR -->|"POST /api/chat"| CHAT
  CHAT -->|"Bearer DEEPSEEK_API_KEY"| DS
  PGROUTE -->|"Bearer sk_…"| APIKEY
  AG -->|"Bearer sk_…"| APIKEY
  BR -->|"console calls (JWT)"| AUTHZ

  APIKEY --> RATE --> VAL --> SVC
  AUTHZ --> RATE
  SVC <--> STORE
  SVC --> INF
  INF -->|"POST /evaluate"| EVAL
  EVAL --> NLI
  EVAL --> CON
  CFG -.-> EVAL
```

**Node/edge list**

- `BR → LAND` : browser loads the public landing page (hero, capabilities, how-it-works, the chatbot playground, API)
- `BR → PGROUTE` : the playground posts `{goal, subtask}` to be evaluated
- `BR → CHAT` : the chatbot posts conversation history to generate candidate goals
- `CHAT → DS` : the chat route calls DeepSeek with the server-held `DEEPSEEK_API_KEY`
- `PGROUTE → APIKEY` : server-side proxy attaches the server-held API key
- `AG → APIKEY` : agent calls `POST /api/evaluate` with its own API key
- `BR → AUTHZ` : console pages call with the access JWT
- `APIKEY → RATE → VAL → SVC` : data-plane request path
- `SVC ↔ STORE` : reads/writes users, keys, evaluation logs, refresh tokens, counters
- `SVC → INF → EVAL` : gateway proxies inference
- `EVAL → NLI`, `EVAL → CON` : both models run per request (concurrently)
- `CFG ⇢ EVAL` : model dirs + thresholds loaded from `model_config.json`

---

## 4. Runtime topology

| Process | Port | Start command | Notes |
| --- | --- | --- | --- |
| Next.js console | `3000` | `cd sentinel-client && npm run dev` | Serves the site, the console and the `/api/*` route handlers |
| Express gateway | `4000` | `cd express-server && ./run.sh` / `npm start` | Deliberately not 3000 (console owns it) |
| FastAPI inference | `8000` | `cd fastapi && ./run.sh` | Loads both models + warms up at startup |

The two backend services ship `run.sh` (bash) and `run.ps1` (PowerShell) that create the venv /
install deps on first run; the client is plain `npm`. `.gitattributes` pins `*.sh` to LF and
`*.ps1` to CRLF.

**Dependency direction:** `client → express → fastapi`. FastAPI has no knowledge of the gateway.
Express degrades to **mock inference** when FastAPI is down (`INFERENCE_MOCK=true`).

---

## 5. Component inventory

### 5.1 `sentinel-client` (Next.js)

```
app/
  layout.tsx                 root layout: fonts (Inter · Geist Mono, via next/font) + metadata
  globals.css                custom daisyUI theme "sentinel" (light, blue) + @theme tokens + .sentinel-card, .label-mono, .badge-*
  page.tsx                   landing page: hero · capabilities · how-it-works · chatbot playground · API · CTA
  (auth)/login/              sign-in / create-account surface (Server Actions)
  (app)/                     authenticated console: layout (verifySession + shell) → dashboard · api-keys
                             · logs (+ logs/[requestId]) · settings
  api/playground/route.ts    server-side proxy → Express POST /api/evaluate
  api/chat/route.ts          DeepSeek-backed goal generator (server-held key, per-IP limit)
  api/auth/refresh/route.ts  rotates the session token pair
  docs/page.tsx              public API reference + tutorials
components/
  site-header.tsx · site-footer.tsx   marketing chrome
  chatbot.tsx                landing "playground": goal generation + live evaluation
  sentinel-logo.tsx          brand marks (full / icon / thinking)
  console/                   console-shell.tsx (drawer + sidebar + topbar) · nav-items.ts
  docs/                      docs explorer + section renderers
  ui/                        button · eyebrow · section · stat-card · status-badge
lib/
  api/                       typed server-side gateway client (client, auth, stats, models, keys, requests, types)
  auth/                      session cookie codec, read/create/delete, DAL, sign-out
  docs/api-reference.ts      the /docs content
  cn.ts                      class-name joiner
proxy.ts                     optimistic auth gate (Next 16's Proxy — formerly middleware)
```

**Design system:** a single light daisyUI theme (`sentinel`) — professional blue accent (#2563eb)
on a near-white surface. Body/UI text **Inter**, labels/data **Geist Mono**. Sections are divided
by 1px hairlines (`border-border`) with rounded cards (no heavy fills or shadows); status is
always icon **+** label **+** colour. Brand assets (`sentinel-logo-*.svg`) live in `public/` and
`components/sentinel-logo.tsx`.

### 5.2 `express-server` (Express 5, CommonJS)

```
src/
  server.js                 bootstrap: store → app → listen → dev seed → SIGINT/SIGTERM
  app.js                    app factory: helmet, cors, json(100kb), requestId, accessLog, routes, 404, errorHandler
  seed.js                   dev-only demo user + API key (key pinnable via SEED_DEMO_API_KEY)
  config/env.js             env loading (process.loadEnvFile) + defaults + validation
  lib/                      errors (AppError + code→status map), crypto (key gen/sha256), jwt,
                            password (scrypt), csv, logger (JSON lines)
  middleware/               requestId, logger, validate (zod→req.validated), requireConsoleAuth,
                            requireApiKey, rateLimit (per-key/per-IP/per-user), notFound, errorHandler
  schemas/                  zod: auth, keys, evaluate, requests, stats, common
  services/                 auth · keys · inference.client · evaluation · requests · stats · models
  store/                    index.js (builds store) · sqlite.js (schema + repos)
  routes/                   auth, keys, evaluate, requests, stats, models, health + index (mounts)
```

**Layering rule:** `route → service → store`. Controllers are thin; validation happens in
middleware; errors are thrown as `AppError` and rendered by one handler (Express 5 forwards async
rejections automatically).

### 5.3 `fastapi` (inference)

```
app/
  main.py                   FastAPI app + lifespan (load models, build cache + semaphore)
  config.py                 env settings (pydantic-settings) + model_config.json loader
  models.py                 load CrossEncoder + SentenceTransformer; _resolve fallback policy; warm-up
  preprocess.py             training-parity text formatting (format_nli, format_document)
  service.py                pure logic: softmax, evaluate_nli, evaluate_contrastive, combine, build_result
  schemas.py                pydantic request/response models (also the OpenAPI doc)
  cache.py                  thread-safe LRU cache
  routers/                  health.py · models_info.py · evaluate.py
tests/                      test_preprocess.py · test_service.py · test_models.py  (22 tests)
model_config.json           model dirs, versions, thresholds, decision rules (written by ../training)
old-training/               legacy training scripts (superseded by ../training)
.models/                    fine-tuned checkpoints (weights git-ignored)
```

---

## 6. API surface

### 6.1 Express gateway (`:4000`)

**Envelope:** console endpoints return `{ data, meta? }`; errors return
`{ error: { code, message, details? } }`. **`POST /api/evaluate` is the exception** — it returns the
spec's flat shape.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/healthz` | none | Liveness |
| GET | `/readyz` | none | Readiness (probes inference) |
| POST | `/api/auth/register` | none | Create account → tokens |
| POST | `/api/auth/login` | none | Login → tokens |
| POST | `/api/auth/refresh` | refresh token | Rotate tokens |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/auth/logout` | JWT | Revoke refresh token |
| GET | `/api/keys` | JWT | List keys (masked) |
| POST | `/api/keys` | JWT | Create key (**plaintext returned once**) |
| GET | `/api/keys/:id` | JWT | Key detail |
| PATCH | `/api/keys/:id` | JWT | Activate / deactivate / rename |
| DELETE | `/api/keys/:id` | JWT | Delete key |
| POST | `/api/evaluate` | **API key** | Evaluate goal+subtask (flat response) |
| POST | `/api/evaluate/preview` | JWT | Evaluate with threshold override (**not logged**) |
| GET | `/api/requests` | JWT | Filterable, paginated logs |
| GET | `/api/requests/:requestId` | JWT | Evaluation detail |
| GET | `/api/requests/export.csv` | JWT | CSV export |
| GET | `/api/stats/summary` | JWT | Dashboard metrics |
| GET | `/api/stats/recent` | JWT | Recent activity feed |
| GET | `/api/models` | JWT | Read-only model info (proxied) |
| GET | `/api/metrics` | JWT | In-process model counters |

Full request/response shapes: [`express-server/API.md`](./express-server/API.md).

### 6.2 FastAPI inference (`:8000`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Loaded models + versions + device (503 until ready) |
| GET | `/models` | Read-only model info (versions, thresholds, metrics) |
| POST | `/evaluate` | Run both models → per-model scores + combined decision |
| GET | `/docs` | Swagger UI |

### 6.3 Next.js (`:3000`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Marketing landing page (hero · capabilities · how-it-works · chatbot playground · API) |
| GET | `/docs` | **Public API reference + tutorials** (`app/docs`) |
| GET | `/login` | Auth surface — sign in / create account (`(auth)` group) |
| GET | `/dashboard` | Console home — stats + recent activity (`(app)` group; session required) |
| GET | `/api-keys` | Console — API-key CRUD (`(app)` group) |
| GET | `/logs` · `/logs/[requestId]` | Console — filterable log + per-evaluation inspector (`(app)` group) |
| GET | `/settings` | Console — read-only model info (`(app)` group) |
| GET | `/api/auth/refresh` | Rotates the session token pair (Route Handler) |
| POST | `/api/playground` | Public playground proxy → Express `/api/evaluate` |
| POST | `/api/chat` | Public chatbot proxy → DeepSeek (goal generation) |

---

## 7. Pipelines

### 7.1 P1 — Evaluation (data plane) — the core pipeline

```mermaid
sequenceDiagram
  autonumber
  participant A as Agent / SDK
  participant E as Express :4000
  participant S as Store (SQLite)
  participant F as FastAPI :8000
  participant M as Models

  A->>E: POST /api/evaluate {goal, subtask, mode} + Bearer sk_…
  E->>E: requireApiKey → sha256 lookup, active? expired?
  E->>E: rate limit (per API key)
  E->>E: zod validate (goal, subtask ≤2000, mode)
  E->>F: POST /evaluate {goal, subtask} (timeout 5s, 1 retry)
  F->>F: preprocess (NLI templates / contrastive framing)
  par both models
    F->>M: CrossEncoder.predict(premise, hypothesis)
    and
    F->>M: SentenceTransformer.encode(goal side, subtask side)
  end
  M-->>F: logits / embeddings
  F->>F: softmax → p(contradiction); cosine similarity
  F->>F: reject if p(contra) > t_nli OR cosine < t_con
  F-->>E: {nli:{score,rejected,threshold,raw_scores}, contrastive:{…}, is_rejected, rejection_reason, model_version}
  E->>S: insert evaluation_requests + bump model_metrics
  E-->>A: mode=standard → {result, date, id}
  Note over E,A: mode=detailed adds {nli:{score,result,threshold}, contrastive:{…}}
```

**Steps**

| # | Stage | Where | Fails with |
| --- | --- | --- | --- |
| 1 | API-key auth (sha256 hash lookup, `is_active`, `expires_at`) | Express middleware | 401 / 403 |
| 2 | Per-key rate limit | Express middleware | 429 |
| 3 | Body validation (zod) | Express middleware | 400 `VALIDATION_ERROR` |
| 4 | Inference call (+ timeout, 1 retry) | `inference.client` | 503 `INFERENCE_UNAVAILABLE` |
| 5 | Preprocess → NLI + contrastive (concurrent) | FastAPI | 500 / 503 |
| 6 | Decision (OR of both models) | FastAPI `service.combine_decisions` | — |
| 7 | Persist log + metrics (best-effort) | Express `evaluation.service` | non-blocking |
| 8 | Shape response by `mode` | Express route | — |

**Timing note:** `response_time_ms` measures **step 4 only** (upstream inference), not the whole
request.

### 7.2 P2 — Playground / chatbot (public demo)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant N as Next route handlers
  participant E as Express :4000
  participant F as FastAPI :8000
  participant D as DeepSeek API

  B->>N: POST /api/chat {messages}
  N->>D: POST /chat/completions (Bearer DEEPSEEK_API_KEY, server-held)
  D-->>N: {message, goals} (JSON mode)
  N-->>B: suggested goals

  B->>N: POST /api/playground {goal, subtask}
  N->>N: validate + per-IP rate limit (20/min)
  N->>E: POST /api/evaluate (Bearer SENTINEL_API_KEY, server-held)
  E->>F: POST /evaluate
  F-->>E: scores + decision
  E-->>N: flat detailed response
  N->>N: normalize → {result, isRejected, rejectionReason, nli, contrastive}
  N-->>B: verdict JSON → UI renders ACCEPTED/REJECTED + meters
```

**Why proxies:** the gateway requires an API key and DeepSeek requires its own key; a browser must
never hold either. Both keys are read on the Next server only (`SENTINEL_API_KEY`,
`DEEPSEEK_API_KEY`).

### 7.3 P3 — Operator authentication

```mermaid
sequenceDiagram
  autonumber
  participant C as Console
  participant E as Express
  participant S as Store

  C->>E: POST /api/auth/register {email, password, fullName}
  E->>E: zod validate; scrypt-hash password; unique email check
  E->>S: create user
  E-->>C: 201 {user, accessToken, refreshToken}
  Note over C,E: login → verify scrypt hash → same token pair

  C->>E: POST /api/auth/refresh {refreshToken}
  E->>S: look up jti; revoked? hash matches? expired?
  E->>S: revoke old jti (rotation)
  E-->>C: {accessToken, refreshToken}
```

- **Access token**: HS256, `typ: "access"`, TTL `JWT_ACCESS_TTL` (default `1h`).
- **Refresh token**: `typ: "refresh"` + `jti`, TTL `JWT_REFRESH_TTL` (default `7d`), **rotated on
  every use** and revocable server-side.
- Passwords: **scrypt** (Node built-in, no native build).

### 7.4 P4 — Console reads

| Flow | Path | Notes |
| --- | --- | --- |
| Logs list | `GET /api/requests` → `requests.service.list` → store | filters: `from,to,status,q,mode,page,pageSize,sort` |
| Log detail | `GET /api/requests/:requestId` | scoped to the caller's own records (404 otherwise) |
| CSV export | `GET /api/requests/export.csv` | same filters, no pagination; 15 columns |
| Stats | `GET /api/stats/summary` / `/recent` | aggregate over `createdAt` window |
| Model info | `GET /api/models` → `models.service.fetchModels` → **FastAPI `/models`** | falls back to last-known with `stale: true` |
| Metrics | `GET /api/metrics` | in-process counters |

---

## 8. Inference internals

### 8.1 Preprocessing (must match training exactly)

| Model | Input construction |
| --- | --- |
| **NLI** | `premise = "An AI agent is authorized to {goal.lower()}. The agent performs only tasks that support this goal."`<br/>`hypothesis = "The agent is now performing: {subtask.lower()}"` |
| **Contrastive** | goal side `= "Goal: {goal}. Subtask: {goal}."`<br/>subtask side `= "Goal: {goal}. Subtask: {subtask}."` (the **`-raw-`** variant; no decomposition) |

### 8.2 Decision logic

```mermaid
flowchart TD
  IN["goal, subtask"] --> SP["softmax(CrossEncoder logits)"]
  IN --> EM["normalize(embeddings) → dot product"]
  SP --> PC["p(contradiction)"]
  EM --> CS["cosine similarity"]
  PC --> D1{"p(contradiction) > nli_threshold?"}
  CS --> D2{"cosine < contrastive_threshold?"}
  D1 -->|yes| R["rejected"]
  D2 -->|yes| R
  D1 -->|no| BOTH{"both accept?"}
  D2 -->|no| BOTH
  BOTH -->|yes| A["accepted"]
```

| Model | Score | Reject when | Notes |
| --- | --- | --- | --- |
| **NLI** `cross-encoder/nli-MiniLM2-L6-H768` | `p(contradiction)` ∈ [0,1] | `score > threshold` | label order **`[contradiction, entailment, neutral]`** — contradiction is index **0**; checkpoint has `activation_fn = Identity`, so **softmax is applied by us** |
| **Contrastive** `all-MiniLM-L12-v2` | cosine ∈ [−1,1] | `score < threshold` | framed template on **both** sides; mean pooling + normalize |

**`rejection_reason`** ∈ `accepted` | `nli_reject` | `contrastive_reject` | `both_reject`.

**Artifacts**

| Artifact | Path |
| --- | --- |
| NLI (final) | `fastapi/.models/sentinelagent-nli-finetuned/` |
| Contrastive (final) | `fastapi/.models/contrastive-miniLM-e4-b32-lr1e-05-mn64-mrg0.5-raw/` |
| Config | `fastapi/model_config.json` |

> **Thresholds are real, not placeholders.** They are the mean of the per-fold F1-optimal cut-offs
> of an anchor-grouped 5-fold CV (`threshold_source: cross_validation_mean`) — NLI **`0.924`**,
> contrastive **`0.024`** — written into `model_config.json` by the training pipeline;
> `training/deploy_to_fastapi.sh` copies the checkpoints into `.models/`.

**Fallback:** a missing fine-tuned dir makes loading **raise** (so `/health` and `/evaluate` return
**503**). `ALLOW_BASE_FALLBACK=1` restores the dev-mode fallback to the base pretrained model, which
reports `on_base_models: true` and a **503** from `/health`. If the inference service is unreachable,
Express can fall back to deterministic mock scores when `INFERENCE_MOCK` / `INFERENCE_MOCK_FALLBACK`
are set (`model_version: "mock"`).

---

## 9. Data model

### 9.1 Store — local SQLite (`express-server/src/store/sqlite.js`)

Everything below is a JS object shape returned by the store. `createStore()` (in
`store/index.js`) opens one SQLite file via `better-sqlite3` (synchronous) and
returns these repositories; `store/sqlite.js` holds the DDL + queries.

```
users           { id, email, username, fullName, passwordHash, isActive, isAdmin,
                  lastLoginAt, createdAt, updatedAt }
apiKeys         { id, userId, keyName, apiKeyHash, apiKeyPrefix, last4, isActive,
                  rateLimitPerMinute, createdAt, lastUsedAt, expiresAt }
requests        { id, userId, apiKeyId, requestId, goal, subtask,
                  isRejected, rejectionReason,
                  nliScore, nliResult, nliThreshold, nliRawScores,
                  contrastiveScore, contrastiveResult, contrastiveThreshold,
                  responseTimeMs, modelVersion, evaluationMode, userAgent, createdAt }
refreshTokens   { jti, userId, tokenHash, expiresAt, revokedAt, createdAt }
modelMetrics    { modelType, evaluationCount, rejectionCount, avgScore,
                  avgResponseTimeMs, lastUpdated }
```

**Everything persists across restarts** in one local SQLite file (`env.dbPath`,
default `express-server/data/sentinel.db`; WAL mode, foreign keys on). `users.email`
is `COLLATE NOCASE UNIQUE` and `api_keys.api_key_hash` is unique. The DB file and
its `-wal`/`-shm` sidecars are git-ignored.

### 9.2 Relational schema — SQLite (from `full_plan.md`, with revisions)

SQLite is dynamically typed, so the type names below map to storage classes:
`uuid`/`varchar`/`text`/`char`/`timestamptz` → **TEXT** (ISO-8601 for timestamps),
`bool` → **INTEGER** `0`/`1` (mapped back to JS booleans by the store), `float` →
**REAL**, `int` → **INTEGER**, `jsonb` → **TEXT** (JSON string). The `users`,
`api_keys`, `evaluation_requests`, `refresh_tokens` and `model_metrics` tables are
confirmed implemented in `store/sqlite.js` (no `threshold_configs`).

```mermaid
erDiagram
  users ||--o{ api_keys : owns
  users ||--o{ threshold_configs : "created_by (DROPPED)"
  api_keys ||--o{ evaluation_requests : "produces"
  users ||--o{ refresh_tokens : "rotates"

  users {
    uuid id PK
    varchar email UK
    varchar password_hash
    bool is_active
    bool is_admin
  }
  api_keys {
    uuid id PK
    uuid user_id FK
    text api_key_hash UK "REVISED: was plaintext api_key"
    text api_key_prefix
    char last4
    bool is_active
    int rate_limit_per_minute
    timestamptz expires_at
  }
  evaluation_requests {
    uuid id PK
    uuid api_key_id FK
    varchar request_id UK
    text goal
    text subtask
    bool is_rejected
    varchar rejection_reason
    float nli_score
    float nli_threshold
    bool nli_result
    jsonb nli_raw_scores "REVISED: label-keyed"
    float contrastive_score
    bool contrastive_result
    float contrastive_threshold
    int response_time_ms
    varchar model_version
    varchar evaluation_mode
    timestamptz created_at
  }
  refresh_tokens {
    uuid id PK
    uuid user_id FK
    text token_hash
    timestamptz expires_at
    timestamptz revoked_at
  }
```

**Revisions vs. `full_plan.md`**

- `api_keys.api_key` (plaintext) → **`api_key_hash` + `api_key_prefix` + `last4`**.
- `threshold_configs` → **dropped**. Thresholds are training artifacts, exposed read-only via
  `GET /api/models`; the console-only `/api/evaluate/preview` accepts experimental overrides.
- `evaluation_requests.nli_raw_scores` → stored **keyed by label** (`contradiction`, `entailment`,
  `neutral`), not the spec's positional `[entailment, neutral, contradiction]`.
- `refresh_tokens` → added (the spec had no refresh-token store).
- `model_metrics` → retained.

---

## 10. Security model

| Concern | Implementation |
| --- | --- |
| API keys | `sk_test_`/`sk_live_` + 32 base62 chars; stored as **sha256**; plaintext shown **once** at creation; `last_used_at` updated on use |
| Passwords | **scrypt** (`N=16384, r=8, p=1`), random 16-byte salt, constant-time compare |
| Console sessions | HS256 JWT access (short TTL) + rotating refresh token; `JWT_SECRET` required in production |
| Ownership | Every console read/write is scoped to `req.user.id`; cross-user access returns **404** (not 403) |
| Rate limits | auth `10/min` per IP · evaluate per-key (`rateLimitPerMinute`) · console `600/min` per user · playground `20/min` per IP |
| Headers | `helmet`; CORS allowlist (`CORS_ORIGINS`) |
| Body size | `express.json({ limit: '100kb' })` |
| Upstream | 5s timeout + 1 retry; malformed upstream payload → `INFERENCE_BAD_RESPONSE` |
| Log hygiene | Access logs contain no headers, bodies, tokens or keys |
| Error messages | `401`/`403` stay generic; 5xx messages hidden in production |
| Secrets in browser | **None** — the playground key stays server-side |

---

## 11. Configuration matrix

### `express-server` (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` tightens behaviour |
| `PORT` | `4000` | HTTP port |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed browser origins |
| `JWT_SECRET` | dev: random | **Required in production** |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `1h` / `7d` | Token lifetimes |
| `INFERENCE_URL` | `http://localhost:8000` | FastAPI base URL |
| `INFERENCE_TIMEOUT_MS` | `5000` | Upstream timeout |
| `INFERENCE_MOCK` | `false` | Skip FastAPI, synthesize scores |
| `INFERENCE_MOCK_FALLBACK` | `false` | Degrade to mock on connection failure |
| `API_KEY_PREFIX` | `sk_test_`/`sk_live_` | Key prefix |
| `RATE_LIMIT_DEFAULT_PER_MIN` | `60` | Default per-key limit |
| `DB_PATH` | `data/sentinel.db` | SQLite file for the whole store; `:memory:` = ephemeral |
| `SEED_DEMO` | `true` (non-prod) | Seed demo user + key at startup |
| `SEED_DEMO_API_KEY` | — | Pin the seeded key (stable across restarts) |

### `fastapi` (environment)

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODELS_DIR` | `fastapi/.models` | Where model folders live |
| `MODEL_CONFIG_PATH` | `fastapi/model_config.json` | Model + threshold config |
| `INFERENCE_DEVICE` | `cpu` | `cpu` or `cuda` |
| `INFERENCE_MAX_CONCURRENCY` | CPU count | Semaphore bound |
| `CACHE_SIZE` | `1024` | LRU entries (`0` disables) |
| `ALLOW_BASE_FALLBACK` | `false` | Opt-in dev fallback to the untrained base models when a `model_dir` is missing |

### `sentinel-client` (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `SENTINEL_API_URL` | Express gateway base URL (default `http://localhost:4000`) |
| `SENTINEL_API_KEY` | Gateway API key — **server-side only**, used by `/api/playground` |
| `DEEPSEEK_API_KEY` | DeepSeek API key for the chatbot goal generator — **server-side only**, used by `/api/chat` |

---

## 12. Current vs. planned

`full_plan.md` is the original thesis spec. Reality diverged deliberately:

| Area | `full_plan.md` | **As built** | Why |
| --- | --- | --- | --- |
| Frontend | React + Vite + React Router | **Next.js 16 App Router** | Server-side proxy for the playground; file routing |
| Data fetching | React Query | **RSC + route handlers** (no client data lib) | Fewer moving parts for this scale |
| Backend split | Express primary, FastAPI "alternative" | **Both**: Express gateway + FastAPI inference | Keeps model runtime isolated, gateway stays I/O |
| Database | Supabase (Postgres + Auth) | **Local SQLite** (`better-sqlite3`) | Fully local, zero external services, persists across restarts |
| Console auth | Supabase Auth | **Custom JWT** (access + rotating refresh) | Provider-agnostic; scrypt passwords |
| API keys | Plaintext column | **sha256 hash + prefix + last4** | Security |
| Thresholds | `threshold_configs`, user-editable | **Training artifacts, read-only** | Thresholds are F1-tuned during training |
| NLI label order | `[entailment, neutral, contradiction]` | **`[contradiction, entailment, neutral]`** | Matches the checkpoint's `id2label` |
| Contrastive input | `encode(goal)`, `encode(subtask)` | **Framed `"Goal: …. Subtask: …."` both sides** | Matches training |
| Styling | Tailwind (default) | **Tailwind v4 + daisyUI custom `sentinel` theme** | Light, professional-blue; hairline borders + rounded cards |

---

## 13. Gaps, next steps & team task dissemination

### 13.1 Current implementation status

**Persistence & environment**

- [x] **Local SQLite store** — `store/sqlite.js` (better-sqlite3) persists users, API keys,
      evaluation logs, refresh tokens and model metrics in one file (§9.1). Seed data installed in
      `express-server/data/sentinel.db`.
- [x] **Linux / cross-platform runner** — `fastapi/run.sh` enhanced with stale/foreign `.venv`
      detection to automatically rebuild broken virtualenvs across OS checkouts.
- [x] **Scratch file cleanup** — stray root `server.js` and `express-server/test.js` removed.
- [ ] Rate limiting is per-instance in-memory (Express and the playground route) — needs a shared
      store for multi-instance.
- [ ] No deployment artifacts (Dockerfiles / compose / CI).

**Frontend & core routes**

- [x] **`/login` exists** (`app/(auth)/login/page.tsx`) — one surface with **Sign in** / **Create
      account** tabs, wired end-to-end to `POST /api/auth/{login,register}`; session token cookies
      and refresh rotation live.
- [x] **`/docs` explorer** (`app/docs/page.tsx`) — full interactive API reference and tutorials.
- [x] **Dashboard & Model Info views built** (`/dashboard`, `/settings`) — connected to Express `/api/stats/summary`, `/api/stats/recent`, `/api/models`, and `/api/metrics` with typed client (`lib/api/`), shared UI primitives (`stat-card.tsx`, `status-badge.tsx`), and skeleton loaders.
- [x] **Console CRUD & inspector built** — `/api-keys` (create / rename / toggle / delete, one-time secret reveal) and `/logs` (filters, pagination, CSV export, `/logs/[requestId]` inspector).
- [x] **Landing chatbot** (`components/chatbot.tsx` + `/api/chat`) — DeepSeek goal generation wired to live evaluation via `/api/playground`.

---

### 13.2 Team task dissemination (3-person matrix)

The remaining development is cleanly partitioned into three independent tracks with zero code overlaps (current status shown):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TASK DISSEMINATION MATRIX                             │
├───────────────┬────────────────────────────┬────────────────────────────────┤
│ Role          │ Focus Area                 │ Target Surfaces & Files        │
├───────────────┼────────────────────────────┼────────────────────────────────┤
│ Track 1       │ Ops Setup & Read-Only      │ • sentinel-client/app/(app)/   │
│ (Aisaiah)     │ Console Views [COMPLETED]  │   dashboard/page.tsx           │
│               │                            │ • sentinel-client/app/(app)/   │
│               │                            │   settings/page.tsx            │
│               │                            │ • lib/api/stats.ts, models.ts  │
├───────────────┼────────────────────────────┼────────────────────────────────┤
│ Track 2       │ Interactive Console CRUD   │ • sentinel-client/app/(app)/   │
│ (Groupmate 1) │ & Request Inspector        │   api-keys/page.tsx            │
│               │                            │ • sentinel-client/app/(app)/   │
│               │                            │   logs/page.tsx & [requestId]/ │
│               │                            │ • lib/api/keys.ts, requests.ts │
├───────────────┼────────────────────────────┼────────────────────────────────┤
│ Track 3       │ Model Calibration,         │ • fastapi/model_config.json    │
│ (Groupmate 2) │ Verification & Test Suites │ • fastapi/tests/test_api.py    │
│               │                            │ • express-server/tests/        │
│ └───────────────┴────────────────────────────┴────────────────────────────────┘
```

#### Track 1: Ops, Client Architecture & Overview Surfaces (Aisaiah) [Completed]
- **Environment & Ops Setup [Completed]**:
  - SQLite database setup and verification in `express-server/data/sentinel.db`.
  - Stale/foreign `.venv` recovery runner in `fastapi/run.sh`.
  - Multi-service root orchestration / startup script (`./start-all.sh` or Docker).
- **Client Architecture & Shared UI Primitives [Completed]**:
  - Authenticated API client wrapper (`sentinel-client/lib/api/client.ts`) and DTO types (`lib/api/types.ts`).
  - Shared console UI components (`components/ui/stat-card.tsx`, `status-badge.tsx`).
  - Resource API clients: `sentinel-client/lib/api/stats.ts` and `sentinel-client/lib/api/models.ts`.
- **Dashboard (`/dashboard`) [Completed]**:
  - Connect to `GET /api/stats/summary?period=24h` and render metric stat cards (*Total Requests*, *Rejection Rate %*, *Avg Response Time ms*, *Active Keys*) with 24h/7d/30d period selector.
  - Connect to `GET /api/stats/recent?limit=10` and render the Recent Activity table showing the last 10 evaluation requests with verdict badges.
  - Implement empty state ("No evaluations yet") and skeleton loading state (`loading.tsx`).
- **Model Info (`/settings`) [Completed]**:
  - Connect to `GET /api/models` and `GET /api/metrics`.
  - Render read-only information cards for **NLI Cross-Encoder** and **Contrastive Bi-Encoder** showing model version, decision rule, active threshold, and runtime counters.
  - Display alert indicator if the gateway falls back to cached metadata when FastAPI is unreachable (`stale: true`).
  - Skeleton loading state (`loading.tsx`).
- **References**: `express-server/API.md` §7 & §8; `sentinel-client/plan.md` §4.2 & §4.5.

#### Track 2: Interactive Console CRUD & Evaluation Inspector (Ash) [Completed]
- **API Key Management (`/api-keys`)** — [Done]:
  - Keys table (`GET /api/keys`): name, prefix, last 4, rate limit, created / last-used dates, status.
  - Create-key modal invoking `POST /api/keys` (`keyName`, `rateLimitPerMinute`, `expiresAt`).
  - **One-time secret reveal**: the plaintext key is returned only once at creation, in a modal with clipboard copy.
  - Key status toggle (`PATCH /api/keys/:id`) and delete confirmation (`DELETE /api/keys/:id`).
- **Logs Viewer (`/logs`)** — [Done]:
  - Filter bar: status (`all` / `accepted` / `rejected`), date range (`from` / `to`), request-ID search.
  - Paginated table (`GET /api/requests`) with latency, decision badge and timestamp.
  - CSV export button → `GET /api/requests/export.csv`.
- **Evaluation Detail Page (`/logs/[requestId]`)** — [Done]:
  - `sentinel-client/app/(app)/logs/[requestId]/page.tsx` calls `GET /api/requests/:requestId`.
  - Full goal/subtask text, combined verdict, dual score-vs-threshold meters, raw NLI label probabilities (`rawScores`) and request metadata.
- **Client API modules** — [Done]: `sentinel-client/lib/api/keys.ts`, `lib/api/requests.ts`.
- **References**: `express-server/API.md` §4 & §6; `sentinel-client/plan.md` §4.3 & §4.4.

#### Track 3: Model Calibration & Automated Testing (Jen) [Calibration done; tests partial]
- **Model Threshold Calibration** — [Done]: `fastapi/model_config.json` now holds the CV-optimal values (NLI `0.924`, contrastive `0.024`, `threshold_source: cross_validation_mean`), not the `0.5` placeholders.
- **FastAPI tests** — [Partial]: `fastapi/tests/` has 22 unit tests (`test_preprocess.py`, `test_service.py`, `test_models.py`). The planned `TestClient` HTTP integration suite (`test_api.py`) is still open.
- **Express API Integration Tests** — [Not started]: there is no `express-server/tests/` yet (auth register/login/refresh, key hashing, evaluation proxy + rate limiting).
- **Model Fallback Verification** — [Done]: `tests/test_models.py` covers `models._resolve` (trained-dir resolution and the `ALLOW_BASE_FALLBACK` policy).
- **References**: `fastapi/model_config.json`; `fastapi/README.md`; `express-server/API.md`.

---

## 14. Machine-readable graph spec

A compact, tool-friendly description of the same graph — handy for prompting a chart generator.

```json
{
  "system": "Sentinel NLI Security Gateway",
  "nodes": [
    { "id": "agent",        "type": "actor",     "label": "Agent / SDK",              "plane": "data" },
    { "id": "browser",      "type": "actor",     "label": "Browser",                  "plane": "public" },
    { "id": "landing",      "type": "ui",        "label": "Landing page (hero · capabilities · chatbot)", "host": "next:3000" },
    { "id": "chatbot_ui",   "type": "ui",        "label": "Chatbot playground component", "host": "next:3000" },
    { "id": "playground_api","type": "endpoint", "label": "POST /api/playground",      "host": "next:3000" },
    { "id": "chat_api",     "type": "endpoint",  "label": "POST /api/chat",            "host": "next:3000" },
    { "id": "deepseek",     "type": "external",  "label": "DeepSeek API",              "host": "external" },
    { "id": "apauth",       "type": "endpoint",  "label": "POST /api/evaluate",        "host": "express:4000", "auth": "api-key" },
    { "id": "preview",      "type": "endpoint",  "label": "POST /api/evaluate/preview","host": "express:4000", "auth": "jwt" },
    { "id": "console_api",  "type": "endpoint",  "label": "/api/auth|keys|requests|stats|models|metrics", "host": "express:4000", "auth": "jwt" },
    { "id": "mw",           "type": "middleware","label": "helmet/cors/json/requestId/log/rate-limit/validate", "host": "express:4000" },
    { "id": "services",     "type": "layer",     "label": "services (auth,keys,evaluation,requests,stats,models)", "host": "express:4000" },
    { "id": "store",        "type": "store",     "label": "SQLite store",               "host": "express:4000" },
    { "id": "inference_cli","type": "client",    "label": "inference.client",           "host": "express:4000" },
    { "id": "eval_api",     "type": "endpoint",  "label": "POST /evaluate",             "host": "fastapi:8000" },
    { "id": "preprocess",   "type": "module",    "label": "preprocess (training-parity)", "host": "fastapi:8000" },
    { "id": "nli",          "type": "model",     "label": "NLI cross-encoder (MiniLM)",  "host": "fastapi:8000" },
    { "id": "contrastive",  "type": "model",     "label": "Contrastive bi-encoder (MiniLM)", "host": "fastapi:8000" },
    { "id": "decision",     "type": "logic",     "label": "reject if either rejects",    "host": "fastapi:8000" },
    { "id": "model_config", "type": "config",    "label": "model_config.json",           "host": "fastapi:8000" }
  ],
  "edges": [
    { "from": "browser", "to": "landing" },
    { "from": "browser", "to": "chatbot_ui" },
    { "from": "chatbot_ui", "to": "chat_api", "label": "{messages}" },
    { "from": "chat_api", "to": "deepseek", "label": "Bearer DEEPSEEK_API_KEY (server-held)" },
    { "from": "chatbot_ui", "to": "playground_api", "label": "{goal, subtask}" },
    { "from": "playground_api", "to": "apauth", "label": "Bearer SENTINEL_API_KEY (server-held)" },
    { "from": "agent", "to": "apauth", "label": "Bearer sk_..." },
    { "from": "browser", "to": "console_api", "label": "Bearer JWT" },
    { "from": "apauth", "to": "mw" },
    { "from": "console_api", "to": "mw" },
    { "from": "preview", "to": "mw" },
    { "from": "mw", "to": "services" },
    { "from": "services", "to": "store", "label": "read/write", "bidirectional": true },
    { "from": "services", "to": "inference_cli" },
    { "from": "inference_cli", "to": "eval_api", "label": "HTTP POST (5s timeout, 1 retry)" },
    { "from": "eval_api", "to": "preprocess" },
    { "from": "preprocess", "to": "nli", "label": "premise/hypothesis" },
    { "from": "preprocess", "to": "contrastive", "label": "framed goal/subtask" },
    { "from": "nli", "to": "decision", "label": "p(contradiction) vs threshold" },
    { "from": "contrastive", "to": "decision", "label": "cosine vs threshold" },
    { "from": "model_config", "to": "eval_api", "label": "dirs + thresholds (dashed)" }
  ],
  "stores": ["users", "apiKeys", "requests", "refreshTokens", "modelMetrics"],
  "ports": { "next": 3000, "express": 4000, "fastapi": 8000 },
  "planes": {
    "data": { "auth": "api-key (sk_...)", "endpoints": ["POST /api/evaluate"] },
    "console": { "auth": "jwt", "endpoints": ["/api/auth/*", "/api/keys/*", "/api/requests*", "/api/stats/*", "/api/models", "/api/metrics", "POST /api/evaluate/preview"] },
    "public": { "auth": "none", "endpoints": ["GET /", "GET /docs", "POST /api/playground", "POST /api/chat"] }
  }
}
```

### Suggested diagram set for a chart

1. **Context / container diagram** — §3 (actors, three containers, ports).
2. **Evaluation sequence** — §7.1 (the money diagram).
3. **Playground sequence** — §7.2 (shows the trust boundary).
4. **Decision flowchart** — §8.2 (the model logic).
5. **ER diagram** — §9.2 (planned Postgres schema).
6. **Auth sequence** — §7.3 (token rotation).
