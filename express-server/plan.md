# Sentinel Server — Express API & Gateway Plan

> **Status:** Draft for review (nothing here is implemented yet — `server.js` is empty).
> **Owner:** `express-server`
> **Scope:** Full backend plan for the Express gateway — architecture, auth, endpoints (API-key issuance, evaluation proxy to FastAPI, logs, stats, model info), Supabase persistence, inference integration with a mock mode, security, testing, and build order.
> **Companion docs:** [`../sentinel-client/plan.md`](../sentinel-client/plan.md) (frontend), [`../Thesis Tool Plan.md`](../Thesis%20Tool%20Plan.md) (product spec).

The Express server is the **single backend gateway** for the NLI Security Gateway. It owns persistence, auth, API-key lifecycle, rate limiting, request logging, and — critically — it **proxies evaluation requests to the FastAPI inference service** (not yet implemented).

---

## Table of Contents

1. [Role & Architecture](#1-role--architecture)
2. [Environment (verified) & Express 5 gotchas](#2-environment-verified--express-5-gotchas)
3. [Stack & Dependencies](#3-stack--dependencies)
4. [Configuration / Environment Variables](#4-configuration--environment-variables)
5. [Project Structure](#5-project-structure)
6. [Middleware Stack](#6-middleware-stack)
7. [Data Model (Supabase)](#7-data-model-supabase)
8. [Auth: Console (JWT) & Data plane (API keys)](#8-auth-console-jwt--data-plane-api-keys)
9. [API Reference — Console endpoints](#9-api-reference--console-endpoints)
10. [API Reference — Evaluation endpoint (public)](#10-api-reference--evaluation-endpoint-public)
11. [Evaluation Flow](#11-evaluation-flow)
12. [FastAPI Integration & Mock Mode](#12-fastapi-integration--mock-mode)
13. [API-Key Generation & Storage](#13-api-key-generation--storage)
14. [Rate Limiting](#14-rate-limiting)
15. [Logging, Errors & Observability](#15-logging-errors--observability)
16. [Validation](#16-validation)
17. [Security](#17-security)
18. [Testing](#18-testing)
19. [Build Order / Milestones](#19-build-order--milestones)
20. [Decisions Log & Open Questions](#20-decisions-log--open-questions)
21. [Appendix](#21-appendix)

---

## 1. Role & Architecture

### 1.1 System diagram

```
        ┌────────────────────────┐
        │  sentinel-client       │   operator console
        │  (Next.js, RSC +       │   (Server Components / Server Actions)
        │   Server Actions)      │
        └───────────┬────────────┘
                    │  HTTP/JSON  ·  Bearer <console JWT>   (server-to-server)
                    ▼
        ┌──────────────────────────────────────┐
        │           express-server             │   ← THE GATEWAY (this plan)
        │  · console API  (/api/auth,/api/keys │
        │    /api/requests,/api/stats,         │
        │    /api/models)                      │
        │  · public API   (/api/evaluate)      │
        │  · auth, rate limit, logging         │
        └───────┬───────────────────────┬──────┘
                │                       │
     Supabase   │                       │  HTTP/JSON
   (Postgres)   │                       │  POST /evaluate
                ▼                       ▼
     ┌────────────────┐      ┌────────────────────────┐
     │  Postgres      │      │  fastapi (inference)   │
     │  · users       │      │  · NLI cross-encoder   │
     │  · api_keys    │      │  · contrastive model   │
     │  · evaluation_ │      │  (NOT IMPLEMENTED yet) │
     │    requests    │      └────────────────────────┘
     │  · model_      │
     │    metrics     │
     └────────────────┘
```

### 1.2 Two access planes, two auth schemes

| Plane | Who calls it | Auth | Endpoints |
| --- | --- | --- | --- |
| **Console plane** | `sentinel-client` (the operator console), acting on behalf of a logged-in user | **JWT bearer** (`Authorization: Bearer <jwt>`) | `/api/auth/*`, `/api/keys/*`, `/api/requests*`, `/api/stats/*`, `/api/models`, `/api/evaluate/preview` |
| **Data plane** | Third-party agents/SDKs sending subtasks to be verified | **API key** (`Authorization: Bearer sk_...` or `x-api-key`) | `/api/evaluate` |

Keeping these separate is a core design choice: the JWT identifies an **operator**; the API key identifies a **machine client**. Do not let one scheme authenticate the other's routes.

### 1.3 Console ↔ Express transport (reconciling with the frontend plan)

The frontend plan uses Next.js **Server Actions** for mutations and **Server Components** for reads, calling a typed `lib/api/*` client. So the browser never holds the JWT directly:

```
browser ──(Next server action / RSC)──▶ Next server ──(Bearer JWT)──▶ Express
```

- Login/signup Server Actions call Express, receive the JWT, and stash it in an **httpOnly, secure, sameSite cookie** on the Next side. Subsequent Next→Express calls read that cookie and attach `Authorization: Bearer …`.
- The JWT is therefore never exposed to client JS (no `localStorage`). Access tokens are short-lived; refresh handled in §8.3.

### 1.4 Non-goals (for now)

- Implementing the inference models (that's `fastapi/`).
- The console UI (that's `sentinel-client/`).
- Multi-tenant orgs / RBAC beyond `is_admin` (see Q9).

---

## 2. Environment (verified) & Express 5 gotchas

Verified in this workspace:

- `express@5.2.1` (Express 5 — **not** 4), `node v25.2.1`, CommonJS (`"type": "commonjs"`).
- `server.js` is empty; `test.js` is a hello-world on port **3000**. `package.json` `"main": "index.js"` (mismatch — the bootstrap should be `server.js`; fix scripts/`main`).
- `fastapi/` is **empty**.
- Supabase/Postgres is not yet connected.

**Express 5 behaviors that shape this plan:**

- **Async errors auto-forward.** Internally `ret.then(null, next)` (via `router@2.2.0`), so an `async` route handler that throws/rejects automatically reaches the error middleware — no `try/catch` wrapper needed (we still add one where we need custom mapping).
- **Routing uses `path-to-regexp@8`.** Unnamed wildcards are invalid: `/*` throws; use named wildcards (`/files/*splat`). Optional segments use `{...}` instead of `?`. Avoid exotic patterns; keep routes static or `:param`.
- `res.status(...)`, `res.json(...)` unchanged. `req.query` is a getter (parsed by `qs`).
- Error middleware still has the 4-arg signature `(err, req, res, next)`.

> **Guardrail:** don't copy Express 4 idioms (e.g. `app.del`, `res.send(status)`), and don't rely on unnamed `*` routes.

---

## 3. Stack & Dependencies

Dependencies to add (`express` already present):

| Package | Purpose |
| --- | --- |
| `@supabase/supabase-js` | Supabase Postgres client (service role, server-only). |
| `jsonwebtoken` | Sign/verify console JWTs. |
| `argon2` (or `bcrypt`) | Password hashing. **Prefer `argon2id`.** |
| `zod` | Request/query validation + typed schemas. |
| `express-rate-limit` | Per-API-key and per-IP throttling. |
| `helmet` | Security headers. |
| `cors` | Allowlist the console origin. |
| `pino` + `pino-http` | Structured logging (or `morgan` for simplicity). |
| `dotenv` | Env loading in dev. |
| **dev:** `vitest` + `supertest` | Unit + HTTP integration tests. |
| **dev:** `nodemon` (or `node --watch`) | Dev reload. |

Optional/later: `ioredis` (shared rate-limit store), `csv-stringify` (streaming CSV export), `nanoid` (request IDs).

> Language: the existing scaffold is **CommonJS JavaScript**. This plan stays JS/CJS to match it; migrating to TypeScript + ESM is an open question (**Q1**).

---

## 4. Configuration / Environment Variables

`.env.example` (never commit real `.env`):

```dotenv
# Server
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000           # the Next.js console origin(s), comma-separated

# Supabase (server-only; SERVICE ROLE bypasses RLS — keep secret)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth
JWT_SECRET=<32+ random bytes>
JWT_ACCESS_TTL=1h
JWT_REFRESH_TTL=7d

# Inference service
INFERENCE_URL=http://localhost:8000
INFERENCE_TIMEOUT_MS=5000
INFERENCE_MOCK=false                          # true = never call FastAPI, synthesize scores

# Rate limits
RATE_LIMIT_DEFAULT_PER_MIN=60
```

Config is loaded once in `src/config/env.js`, validated with zod, and exported as a frozen object. **Fail fast** if required vars are missing.

---

## 5. Project Structure

Proposed layout (replacing the empty `server.js`):

```
express-server/
├─ src/
│  ├─ server.js                 # bootstrap: load env, connect, app.listen
│  ├─ app.js                    # build express app (no listen) — unit-testable
│  ├─ config/
│  │  └─ env.js                 # validated env object
│  ├─ routes/
│  │  ├─ index.js               # mounts all routers under /api
│  │  ├─ auth.routes.js
│  │  ├─ keys.routes.js
│  │  ├─ evaluate.routes.js
│  │  ├─ requests.routes.js
│  │  ├─ stats.routes.js
│  │  └─ models.routes.js
│  ├─ controllers/              # thin: parse → call service → shape response
│  │  ├─ auth.controller.js
│  │  ├─ keys.controller.js
│  │  ├─ evaluate.controller.js
│  │  ├─ requests.controller.js
│  │  ├─ stats.controller.js
│  │  └─ models.controller.js
│  ├─ services/                 # business logic
│  │  ├─ auth.service.js
│  │  ├─ keys.service.js
│  │  ├─ evaluation.service.js
│  │  ├─ inference.client.js    # the FastAPI (or mock) client
│  │  ├─ requests.service.js
│  │  ├─ stats.service.js
│  │  └─ models.service.js      # model info, proxied from the inference service
│  ├─ repositories/             # Supabase data access (one per table)
│  │  ├─ users.repo.js
│  │  ├─ apiKeys.repo.js
│  │  └─ requests.repo.js
│  ├─ middleware/
│  │  ├─ requestId.js
│  │  ├─ logger.js
│  │  ├─ requireConsoleAuth.js  # verify JWT → req.user
│  │  ├─ requireApiKey.js       # verify API key → req.apiKey
│  │  ├─ rateLimit.js
│  │  ├─ validate.js            # zod schema → middleware
│  │  ├─ notFound.js
│  │  └─ errorHandler.js
│  ├─ lib/
│  │  ├─ supabase.js            # client singleton
│  │  ├─ jwt.js                 # sign/verify
│  │  ├─ crypto.js              # key gen, hashing
│  │  ├─ errors.js              # AppError + codes
│  │  ├─ csv.js                 # CSV serialization
│  │  └─ asyncHandler.js        # (optional; Express 5 auto-forwards)
│  └─ schemas/                  # zod schemas per resource
│     ├─ auth.schema.js
│     ├─ keys.schema.js
│     └─ evaluate.schema.js
├─ tests/
│  ├─ auth.test.js
│  ├─ keys.test.js
│  ├─ evaluate.test.js
│  └─ inference.client.test.js
├─ .env.example
├─ package.json
└─ README.md
```

`package.json` scripts: `dev` (`node --watch src/server.js`), `start` (`node src/server.js`), `test` (`vitest run`), `lint`.

---

## 6. Middleware Stack

Applied in `app.js`, in this order:

1. `helmet()` — security headers.
2. `cors({ origin: env.CORS_ORIGINS, credentials: true })`.
3. `express.json({ limit: '100kb' })` — bounded body size.
4. `requestId` — assign/propagate `X-Request-Id` (`req.id`).
5. `pino-http` — structured access logs (includes `req.id`).
6. Route-level: `rateLimit`, then auth (`requireConsoleAuth` **or** `requireApiKey`), then `validate(schema)`.
7. `notFound` — 404 for unmatched routes.
8. `errorHandler(err, req, res, next)` — last; maps `AppError` → HTTP.

Health endpoints (`/healthz`, `/readyz`) are mounted **before** auth.

---

## 7. Data Model (Supabase)

Uses the schema from the spec (see [`../Thesis Tool Plan.md`](../Thesis%20Tool%20Plan.md)): `users`, `api_keys`, `evaluation_requests`, `model_metrics`. **`threshold_configs` is dropped** — thresholds are training-derived model artifacts, not user settings (see §7.4).

### 7.1 Required schema change — hash API keys

The spec stores `api_keys.api_key VARCHAR(64)` in **plaintext**, which contradicts its own security recommendation ("API keys should be hashed in database"). Change to:

```sql
ALTER TABLE api_keys
  DROP COLUMN api_key,
  ADD COLUMN api_key_hash   TEXT    NOT NULL,   -- sha256(plaintext), hex
  ADD COLUMN api_key_prefix TEXT    NOT NULL,   -- e.g. 'sk_live_a1b2' for display/search
  ADD COLUMN last4          CHAR(4) NOT NULL;    -- for masked display
CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(api_key_hash);
```

Everything else in the spec's schema is usable as-is except the threshold table (see §7.4).

### 7.2 Access model

- Express uses the **service-role key** → bypasses RLS. **Express is the trust boundary**: every query must be scoped to `req.user.id` (or `req.apiKey.user_id`) explicitly. Never trust a client-supplied `user_id`.
- If we later enable RLS, mirror these checks in policies.

### 7.3 Derived/aggregate needs

- **Dashboard stats** (`total`, `rejection_rate`, `avg_response_time_ms`) are computed with aggregate queries over `evaluation_requests` scoped to the user's keys, filtered by an optional time window.
- **`model_metrics`** is updated either on-write or by a periodic job (**Q8**). v1: update on-write (cheap increments) to avoid a scheduler.

### 7.4 Drop `threshold_configs`; record thresholds per request

Thresholds are **determined by training** (NLI: F1-tuned `p(contradiction)`; contrastive: F1-optimal cosine), so they are not operator-editable and do not belong in a settings table. Consequences:

- **Drop `threshold_configs`.** The source of truth is the committed `model_config.json` (see [`../fastapi/plan.md`](../fastapi/plan.md)).
- **Keep** `evaluation_requests.nli_threshold` / `contrastive_threshold` — these record **which threshold was used for that request**, which is valuable for auditing (especially if a preview override was applied).
- **Correct** the `evaluation_requests.nli_raw_scores` comment: the NLI model's label order is `[contradiction, entailment, neutral]`, so store it keyed by label, e.g. `{"contradiction":..,"entailment":..,"neutral":..}` — **not** the spec's positional `[entailment, neutral, contradiction]`.

```sql
DROP TABLE IF EXISTS threshold_configs;
-- nli_raw_scores: store as a label-keyed object (contradiction is index 0 in the model)
COMMENT ON COLUMN evaluation_requests.nli_raw_scores IS '{"contradiction","entailment","neutral"}'; 
```

---

## 8. Auth: Console (JWT) & Data plane (API keys)

### 8.1 Console registration & login

- `POST /api/auth/register` — email + password (+ optional `fullName`). Validate with zod, ensure email unique, hash password with **argon2id**, insert `users` row, issue tokens. Returns the user (never the hash).
- `POST /api/auth/login` — verify credentials, update `last_login_at`, issue tokens.
- Passwords: min length ≥ 12, checked server-side. Generic error messages to prevent account enumeration.
- `users.password_hash` is used (we are **not** using Supabase Auth — Supabase is just our Postgres; see D1/§1.2).

### 8.2 JWT scheme

- **Access token:** HS256, `sub = user.id`, `email`, TTL from `JWT_ACCESS_TTL` (default 1h). Verified by `requireConsoleAuth`.
- **Refresh token:** longer TTL (`JWT_REFRESH_TTL`, default 7d), stored server-side (a `refresh_tokens` table or a `token_version` column) so it can be revoked. `POST /api/auth/refresh` rotates it.
- `JWT_SECRET` must be ≥ 32 random bytes; rotate via env in prod.
- `requireConsoleAuth` reads `Authorization: Bearer <access>`, verifies, loads a minimal user record, sets `req.user = { id, email, isAdmin }`.

### 8.3 Token handoff to the console

The console's Next server stores the access (and refresh) token in an httpOnly cookie and forwards the access token as a Bearer header. On `401` from Express, the Next layer attempts `/api/auth/refresh` once, then forces re-login. (This is the seam described in the frontend plan's auth section.)

### 8.4 Data-plane API-key auth

- `requireApiKey` accepts `Authorization: Bearer sk_...` **or** `x-api-key: sk_...`.
- Hash the presented secret (sha256) and look up `api_keys` by `api_key_hash` (indexed). Reject if missing, `is_active = false`, or `expires_at < now()`.
- On success: set `req.apiKey = { id, userId, rateLimitPerMinute }` and update `last_used_at` (async, best-effort).
- **No user session is created** — the API key carries the tenant.

---

## 9. API Reference — Console endpoints

All console endpoints require `Authorization: Bearer <console JWT>` unless noted. Responses use the **envelope** in §15.3. Base path `/api`.

| # | Method | Path | Auth | Purpose |
| --- | --- | --- | --- | --- |
| 1 | GET | `/healthz` | none | Liveness. |
| 2 | GET | `/readyz` | none | Readiness (checks Supabase + inference reachability). |
| 3 | POST | `/api/auth/register` | none | Create account → tokens. |
| 4 | POST | `/api/auth/login` | none | Login → tokens. |
| 5 | POST | `/api/auth/refresh` | refresh token | Rotate tokens. |
| 6 | GET | `/api/auth/me` | JWT | Current user. |
| 7 | POST | `/api/auth/logout` | JWT | Revoke refresh token. |
| 8 | GET | `/api/keys` | JWT | List my keys (masked). |
| 9 | POST | `/api/keys` | JWT | **Create an API key.** |
| 10 | GET | `/api/keys/:id` | JWT | Key detail. |
| 11 | PATCH | `/api/keys/:id` | JWT | Activate / deactivate. |
| 12 | DELETE | `/api/keys/:id` | JWT | Delete (soft or hard). |
| 13 | GET | `/api/requests` | JWT | Paginated, filterable log query. |
| 14 | GET | `/api/requests/:requestId` | JWT | Evaluation detail. |
| 15 | GET | `/api/requests/export.csv` | JWT | CSV export (same filters). |
| 16 | GET | `/api/stats/summary` | JWT | Dashboard headline metrics. |
| 17 | GET | `/api/stats/recent` | JWT | Recent activity feed. |
| 18 | GET | `/api/models` | JWT | Read-only **model info** (versions, trained thresholds, metrics). |
| 19 | POST | `/api/evaluate/preview` | JWT | Console-plane evaluation **preview** with optional threshold override (not logged). |
| 20 | GET | `/api/metrics` | JWT | `model_metrics` (optional). |
| 21 | POST | `/api/evaluate` | **API key** | Verify a subtask (public; §10). |

### 9.1 Auth endpoints (detail)

**`POST /api/auth/register`**
```jsonc
// request
{ "email": "op@acme.io", "password": "correct horse battery", "fullName": "Op" }
// 201
{ "data": { "user": { "id": "uuid", "email": "op@acme.io", "fullName": "Op", "isAdmin": false },
            "accessToken": "eyJ...", "refreshToken": "eyJ..." } }
```

**`POST /api/auth/login`** — `{ email, password }` → `200 { data: { user, accessToken, refreshToken } }`. `401 INVALID_CREDENTIALS` on failure.
**`GET /api/auth/me`** — → `200 { data: { user } }`.
**`POST /api/auth/refresh`** — `{ refreshToken }` → `200 { data: { accessToken, refreshToken } }`.

### 9.2 API-key endpoints (detail) — **the "create api keys" requirement**

**`POST /api/keys`** — create a key for the current user.

```jsonc
// request
{
  "keyName": "Thesis eval key",
  "rateLimitPerMinute": 60,        // optional, default from env
  "expiresAt": "2026-12-31T00:00:00Z" // optional, null = never
}
// 201 — NOTE: `key` (plaintext) is returned EXACTLY ONCE and never stored.
{
  "data": {
    "key": "sk_live_8f3a...c9",     // show once, offer copy-to-clipboard
    "record": {
      "id": "uuid",
      "keyName": "Thesis eval key",
      "prefix": "sk_live_8f3a",
      "last4": "b1c9",
      "isActive": true,
      "rateLimitPerMinute": 60,
      "createdAt": "2026-01-01T00:00:00Z",
      "expiresAt": "2026-12-31T00:00:00Z",
      "lastUsedAt": null
    }
  }
}
```
Validation: `keyName` 1–100 chars; `rateLimitPerMinute` 1–10000; `expiresAt` future or null. Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `429 RATE_LIMITED`.

**`GET /api/keys`** → `200 { data: { keys: [ /* masked records, NO plaintext */ ] } }`. Each item exposes `prefix`/`last4`, never the secret.
**`PATCH /api/keys/:id`** — `{ "isActive": false }` → toggles. Enforces ownership (`user_id = req.user.id`).
**`DELETE /api/keys/:id`** — deletes (or sets `is_active=false`; see Q6). Enforces ownership.
**`GET /api/keys/:id`** — single masked record.

### 9.3 Requests / logs endpoints

**`GET /api/requests`** — query params (all optional):

| Param | Type | Notes |
| --- | --- | --- |
| `from`, `to` | ISO date | `created_at` range. |
| `status` | `accepted` \| `rejected` | Maps to `is_rejected`. |
| `q` | string | Search by `request_id` (prefix/exact). |
| `mode` | `standard` \| `detailed` | Filter by `evaluation_mode`. |
| `page`, `pageSize` | int | Default `1` / `25`, max `100`. |
| `sort` | `created_at` \| `response_time_ms` | Default `created_at desc`. |

→ `200 { data: { requests: [...], }, meta: { page, pageSize, total, totalPages } }`, scoped to the user's keys.

**`GET /api/requests/:requestId`** → full record including `nli_raw_scores`, both models' scores/thresholds/results, `rejection_reason`, metadata. `404 NOT_FOUND` if not owned.

**`GET /api/requests/export.csv`** → `text/csv` stream via `Content-Disposition: attachment`. Honors the same filters (ignore pagination; enforce a max row cap, see Q7). Columns: `request_id, created_at, goal, subtask, is_rejected, rejection_reason, nli_score, nli_threshold, nli_result, contrastive_score, contrastive_threshold, contrastive_result, response_time_ms, model_version, evaluation_mode`.

### 9.4 Stats endpoints

**`GET /api/stats/summary?period=24h|7d|30d`** →
```jsonc
{ "data": {
    "totalRequests": 1284,
    "rejectionRate": 0.17,          // 0..1
    "avgResponseTimeMs": 142,
    "activeKeys": 3,
    "period": "24h"
} }
```
**`GET /api/stats/recent?limit=10`** → `200 { data: { requests: [ /* same projection as logs list */ ] } }`.

### 9.5 Model info endpoint (read-only)

Thresholds and model versions are **training artifacts** (see [`../fastapi/plan.md`](../fastapi/plan.md) §1.4), not user settings — so there is **no write path**. Express proxies the inference service's `GET /models` and returns it read-only. `version` strings mirror the shipped dirs under `fastapi/.models/`.

**`GET /api/models`** →
```jsonc
{ "data": {
  "source": "model_config.json",
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
    "version": "contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2",
    "decision": "cosine < threshold",
    "threshold": 0.58,
    "metrics": { "tpr": 0.88, "fpr": 0.07, "f1": 0.89 }
  }
} }
```
The console shows this on its **Model info** page (previously "Settings"). If the inference service is unreachable, Express returns the last-known `model_config.json` with `"stale": true` rather than erroring.

### 9.6 Evaluation preview (experimental override)

**`POST /api/evaluate/preview`** (console JWT) — runs the models on an ad-hoc `{ goal, subtask, mode?, nliThreshold?, contrastiveThreshold? }` **without** consuming an API key and **without** writing to `evaluation_requests`. This is the **only** place a threshold override is accepted; the public `/api/evaluate` never accepts one (a tenant must not be able to weaken its own security threshold). Validation: overrides in `(0,1)`.

---

## 10. API Reference — Evaluation endpoint (public)

**`POST /api/evaluate`** — the core endpoint agents call.

- **Auth:** API key (`Authorization: Bearer sk_...` or `x-api-key`).
- **Rate limit:** per API key (§14).
- **Body:**
```jsonc
{ "goal": "summarize a document", "subtask": "read the public API docs", "mode": "standard" }
```
`mode` ∈ `standard` | `detailed` (default `standard`). `goal`/`subtask` required, non-empty, bounded length (e.g. ≤ 2000 chars). **Threshold overrides are not accepted here** — they exist only on the console-only `/api/evaluate/preview` (§9.6).

- **Response shape:** matches the **spec exactly** (no envelope) so external SDKs are stable.

**Standard mode → `200`:**
```jsonc
{ "result": true, "date": "2026-01-01T12:00:00.000Z", "id": "<requestId>" }
```
**Detailed mode → `200`:**
```jsonc
{
  "result": true,
  "date": "2026-01-01T12:00:00.000Z",
  "id": "<requestId>",
  "nli":         { "score": 0.12, "result": true, "threshold": 0.62 },
  "contrastive": { "score": 0.81, "result": true, "threshold": 0.58 }
}
```
(`result: true` = **accepted**; `nli.result`/`contrastive.result` use the spec's "true = accepted" convention, i.e. inverted from the model's raw reject booleans. `nli.score` = probability of **contradiction** (higher = more malicious); `contrastive.score` = cosine similarity (lower = more malicious). `threshold` is the trained value used.)

- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (bad/missing key), `403 FORBIDDEN` (inactive/expired), `429 RATE_LIMITED`, `503 INFERENCE_UNAVAILABLE`.

---

## 11. Evaluation Flow

`POST /api/evaluate` end-to-end:

1. **Authenticate** — `requireApiKey` resolves `req.apiKey` (id + user_id + rate limit).
2. **Rate limit** — enforce `rateLimitPerMinute` for that key (§14).
3. **Validate** — zod: `goal`, `subtask`, `mode`.
4. **No threshold resolution in Express** — the inference service applies its configured (trained) thresholds. Express never reads thresholds from the DB.
5. **Call inference** — `inference.client.evaluate({ goal, subtask })` → FastAPI `/evaluate` (or mock, §12). Overrides are passed **only** by the console-only preview route (§9.6).
6. **Decide** — `is_rejected = nli.result || contrastive.result`; `rejection_reason` ∈ `nli_reject` | `contrastive_reject` | `both_reject` | `accepted`.
7. **Log** — insert into `evaluation_requests`: goal, subtask, results, scores, thresholds, raw NLI scores, `request_id`, `api_key_id`, `response_time_ms`, `user_agent`, `model_version`, `evaluation_mode`.
8. **Respond** — shape per requested `mode` (§10).
9. **Update metrics** — best-effort increment of `model_metrics` (non-blocking).

> **Timing:** measure `response_time_ms` around step 5 only (inference latency), not the whole request — matches the field's intent.

### 11.1 Decision semantics (inferred from the training code)

Inferred from `fastapi/old-training/` (see [`../fastapi/plan.md`](../fastapi/plan.md)):

- **NLI** (`cross-encoder/nli-MiniLM2-L6-H768`, label order `[contradiction, entailment, neutral]`): reject when `p(contradiction) > nli_threshold`; the threshold is **F1-tuned during training** (default from `model_config.json`, e.g. `0.62`).
- **Contrastive** (`all-MiniLM-L12-v2`, framed `Goal: … Subtask: …` input): reject when `cosine_similarity < contrastive_threshold`; threshold is the **F1-optimal value from training** (e.g. `0.58`).
- Overall: **reject if EITHER rejects.**

> Thresholds are **training artifacts**, not operator settings — hence the read-only model-info surface (§9.5) replacing the earlier editable thresholds endpoint.

---

## 12. FastAPI Integration & Mock Mode

### 12.1 Contract (what `fastapi/` must expose)

The inference service is planned in [`../fastapi/plan.md`](../fastapi/plan.md). Express depends on two routes:

**`POST {INFERENCE_URL}/evaluate`**
```jsonc
// request
{
  "goal": "summarize a document",
  "subtask": "read the public API docs",
  "nli_threshold": 0.62,          // optional; sent only by the console preview route (§9.6)
  "contrastive_threshold": 0.58   // optional; sent only by the console preview route (§9.6)
}
// 200 response
{
  "nli": {
    "score": 0.12,                                     // = p(contradiction)
    "rejected": false,                                 // true = NLI says REJECT
    "threshold": 0.62,
    "raw_scores": { "contradiction": 0.12, "entailment": 0.85, "neutral": 0.03 }
  },
  "contrastive": {
    "score": 0.81,                                     // = cosine similarity
    "rejected": false,                                 // true = contrastive says REJECT
    "threshold": 0.58
  },
  "is_rejected": false,
  "rejection_reason": "accepted",
  "model_version": "nli=sentinelagent-nli-3class-v1;con=contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2"
}
```
**`GET {INFERENCE_URL}/models`** → the model info in §9.5 (versions, thresholds, metrics).
**`GET {INFERENCE_URL}/health`** → `200 { "status": "ok", "nli_loaded": true, "contrastive_loaded": true }` for `/readyz`.

> **Note (label order):** the NLI output is keyed by label (`contradiction` is index 0), not a positional array — this corrects the spec's `[entailment, neutral, contradiction]` assumption.

### 12.2 Client (`services/inference.client.js`)

- Uses global **`fetch`** (Node 25) with an `AbortController` timeout (`INFERENCE_TIMEOUT_MS`, default 5000ms).
- One retry on network error / 5xx (with a short backoff); no retry on 4xx.
- Validates the response with a zod schema; a malformed response → `INFERENCE_BAD_RESPONSE` (mapped to `503`).
- Never exposes FastAPI internals to the caller; logs the upstream error with `req.id`.

### 12.3 Mock / fallback mode

Because `fastapi/` is empty, the client supports a **mock** path so the console and SDK can be built end-to-end now:

- `INFERENCE_MOCK=true` → never call FastAPI; synthesize scores.
- **Fallback:** if `INFERENCE_MOCK=false` but the call fails with a connection error, optionally degrade to mock **only when** `INFERENCE_MOCK_FALLBACK=true` (default **false** in prod). Otherwise return `503 INFERENCE_UNAVAILABLE`.

**Mock algorithm (deterministic, explainable):**
- Derive a stable pseudo-random value `h = sha256(goal + "|" + subtask)` → `u ∈ [0,1)`.
- `nli.raw_scores` = a normalized triple with `contradiction = u` (the reject-maximizing label at index 0).
- `contrastive.score` = a second derived value `v ∈ [0,1)` (e.g. from `sha256(subtask + "|" + goal)`).
- Apply the configured thresholds (from `model_config.json`, or mock defaults) so the decision logic is exercised.
- `model_version = "mock"` so mock rows are identifiable in logs.
- Same input ⇒ same output (test-friendly).

> **Note:** mock scores are placeholders, not truth. They exist only to unblock integration; the console should surface `model_version: "mock"` distinctly (see frontend plan's status handling).

---

## 13. API-Key Generation & Storage

- **Format:** `sk_live_` + 32 chars base62 (or `sk_test_` in non-prod). Prefix `sk_live_` + first 4 chars stored as `api_key_prefix`; last 4 as `last4`.
- **Generation:** `crypto.randomBytes(32)` → base62. High entropy; never sequential.
- **Storage:** store **`sha256(plaintext)` hex** only (`api_key_hash`). Optionally HMAC with a server pepper (Q5).
- **Reveal:** plaintext returned **once** on `POST /api/keys`; never logged, never retrievable again.
- **Verification:** hash the presented key, look up by indexed `api_key_hash`, then check `is_active` + `expires_at`.
- **Lifecycle:** `PATCH isActive:false` (revoke), `DELETE` (remove), `last_used_at` updated on use; `expires_at` honored in auth.

---

## 14. Rate Limiting

- **`/api/evaluate`:** keyed by **API key id** (`req.apiKey.id`), limit = `req.apiKey.rateLimitPerMinute`. Returns `429 RATE_LIMITED` with `Retry-After`.
- **`/api/auth/login|register`:** keyed by IP, stricter (e.g. 10/min) to slow credential stuffing.
- **Other console routes:** a generous per-user cap to protect the DB.
- **Store:** in-memory (`express-rate-limit` default) is fine for a single instance; for multi-instance use a shared store (Redis) — see Q3. Headers: `RateLimit-*` (standard) so clients can back off.

---

## 15. Logging, Errors & Observability

### 15.1 Request logging

- Structured JSON (pino) with `req.id` (from `X-Request-Id` or generated), method, path, status, duration, `userId`/`apiKeyId` when known.
- **Never** log secrets, tokens, passwords, or full API keys.

### 15.2 Error handling

- `lib/errors.js` defines `AppError(code, httpStatus, message, details?)` plus named constructors.
- `errorHandler` maps: `AppError → its status`; zod errors → `400 VALIDATION_ERROR` with field details; unknown → `500 INTERNAL` (message hidden in prod, logged with `req.id`).
- Express 5 forwards async rejections automatically, so services can simply `throw new AppError(...)`.

### 15.3 Response envelope (console endpoints)

```jsonc
// success
{ "data": { /* payload */ }, "meta": { /* pagination etc. */ } }
// error
{ "error": { "code": "VALIDATION_ERROR", "message": "goal is required",
             "details": { "field": "goal" } } }
```
`/api/evaluate` intentionally **does not** use this envelope (spec-compatible flat shape, §10).

Error codes: `VALIDATION_ERROR`(400), `UNAUTHORIZED`(401), `INVALID_CREDENTIALS`(401), `FORBIDDEN`(403), `NOT_FOUND`(404), `CONFLICT`(409), `RATE_LIMITED`(429), `INFERENCE_UNAVAILABLE`(503), `INFERENCE_BAD_RESPONSE`(503), `INTERNAL`(500).

### 15.4 Health

- `/healthz` — process is up (always `200`).
- `/readyz` — pings Supabase and `{INFERENCE_URL}/health`; `200` when both fine, `503` otherwise (with which dependency is down).

---

## 16. Validation

- Zod schema per resource (`src/schemas/*`). `validate({ body, query, params })` middleware parses and replaces `req.body`/`req.query` with the parsed value, returning `400` with field-level `details` on failure.
- Constraints: `goal`/`subtask` non-empty ≤ 2000 chars; `mode` enum; `keyName` ≤ 100; `rateLimitPerMinute` 1–10000; preview threshold overrides in (0,1); pagination bounds; `from <= to`.

---

## 17. Security

- **Helmet** for headers; **CORS allowlist** = the console origin(s) only.
- **Secrets** only in env; `SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET` never leave the server.
- **Hash everything sensitive**: passwords (argon2id), API keys (sha256/hmac).
- **Ownership checks** on every console read/write (`user_id = req.user.id`); service-role bypasses RLS, so this is mandatory.
- **Rate limiting** on auth + evaluate; **body size cap**; **timeouts** on upstream calls.
- **HTTPS-only** in production (terminate at the proxy); secure cookies handled by the Next layer.
- **Least data**: never return password hashes or plaintext keys; `401`/`403` messages stay generic.
- **Log hygiene**: redact `authorization`, `x-api-key`, `password`, `refreshToken`.

---

## 18. Testing

- **Unit:** services with mocked repositories; `inference.client` against a stubbed `fetch` (contract test) and in mock mode (determinism).
- **Integration (supertest + vitest):** build `app.js` (no `listen`), hit routes.
  - Auth: register → login → `/me`; wrong password → 401.
  - Keys: create returns plaintext **once**; list never returns plaintext; PATCH toggles; DELETE enforces ownership.
  - Evaluate: valid key → 200 standard + detailed; bad key → 401; inactive → 403; over limit → 429; inference down → 503.
  - Requests: filters/pagination/ownership; CSV export returns `text/csv`.
- **DB in tests:** point Supabase env at a test project or use repository mocks/doubles (Q4).

---

## 19. Build Order / Milestones

**M1 — Skeleton**
1. `src/app.js` + `src/server.js`; config/env with zod; helmet/cors/json; requestId; pino; errorHandler; notFound.
2. `/healthz` + `/readyz`; `lib/supabase.js`, `lib/errors.js`.

**M2 — Auth**
3. `users` repo; argon2 hashing; `POST /register`, `/login`, `/refresh`, `/me`, `/logout`; `lib/jwt.js`; `requireConsoleAuth`.

**M3 — API keys**
4. Schema change (§7.1); `apiKeys.repo`; `lib/crypto.js`.
5. `GET/POST/GET:id/PATCH/DELETE /api/keys`; ownership checks; plaintext-once behavior.

**M4 — Evaluation + inference**
6. `inference.client.js` (fetch + timeout + zod) **and** mock mode.
7. `POST /api/evaluate`; `requireApiKey`; per-key rate limit; decision + logging to `evaluation_requests`.

**M5 — Console reads**
8. `GET /api/requests` (filters + pagination), `/api/requests/:requestId`, `/api/requests/export.csv`.
9. `GET /api/stats/summary`, `/api/stats/recent`.

**M6 — Model info & metrics**
10. `GET /api/models` (proxy FastAPI `/models`); `POST /api/evaluate/preview`; `GET /api/metrics`; on-write `model_metrics`.

**M7 — Hardening**
11. Rate-limit tuning, CORS allowlist, log redaction, `/readyz` dependency checks.
12. Test suite green; README + `.env.example`.

---

## 20. Decisions Log & Open Questions

### Decisions (locked)

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Persistence | **Supabase** (Postgres; service-role from the server) — the target. **Implemented as in-memory for now** behind the `src/store` seam (`createStore()`), so the server runs with no external DB; swap in `createSupabaseStore()` later. |
| D2 | Console auth | **JWT bearer tokens** (access + refresh), issued by Express, held httpOnly by the Next layer. |
| D3 | FastAPI integration | Real proxy **+ mock/fallback mode** so the console/SDK can be built before `fastapi/` exists. |
| D4 | Thresholds | **Training-derived**, exposed **read-only** via `/api/models`; `threshold_configs` dropped; overrides only on the console-only `/api/evaluate/preview`. |
| D5 | Implementation | **CommonJS JavaScript** (matches the scaffold); default port **4000** (Next.js console owns 3000); passwords via `scrypt`, JWTs via `jsonwebtoken`. |

### Open questions

- **Q1 — Language.** **Resolved:** CommonJS JavaScript (see D5).
- **Q2 — Refresh-token storage.** DB table vs a `users.token_version` column for revocation. *Proposed default: `refresh_tokens` table.*
- **Q3 — Rate-limit store.** In-memory (single instance) vs Redis (multi-instance). *Proposed default: in-memory for v1.*
- **Q4 — Test database.** Shared Supabase test project vs repository doubles. *Proposed default: doubles for unit, a test project for integration.*
- **Q5 — Key hashing.** Plain `sha256` vs `hmac` with a server pepper. *Proposed default: `sha256` now, pepper later.*
- **Q6 — Key deletion.** Hard delete vs soft (`is_active=false`). *Proposed default: soft-delete (keeps log FK history).*
- **Q7 — CSV export scope.** Max rows / streaming vs materialized. *Proposed default: stream with a 50k row cap.*
- **Q8 — `model_metrics` refresh.** On-write increments vs scheduled job. *Proposed default: on-write.*
- **Q9 — Admin scope.** Is `is_admin` used (cross-user views) in v1, or single-user only? *Proposed default: single-user only in v1.*
- **Q10 — Thresholds.** *Resolved (D4):* training-derived, read-only; no per-key overrides. Console override is experimental only (preview route).
- **Q12 — Inference contract sync.** Express must track the FastAPI contract in [`../fastapi/plan.md`](../fastapi/plan.md) (label-keyed raw scores). *Owned by the inference client's zod schema.*
- **Q11 — CORS origin.** Exact console origin(s) in dev/prod. Needs a value before M1 hardens.

---

## 21. Appendix

### 21.1 Full endpoint table

| Method | Path | Auth | Milestone |
| --- | --- | --- | --- |
| GET | `/healthz` | none | M1 |
| GET | `/readyz` | none | M1 |
| POST | `/api/auth/register` | none | M2 |
| POST | `/api/auth/login` | none | M2 |
| POST | `/api/auth/refresh` | refresh token | M2 |
| GET | `/api/auth/me` | JWT | M2 |
| POST | `/api/auth/logout` | JWT | M2 |
| GET | `/api/keys` | JWT | M3 |
| POST | `/api/keys` | JWT | M3 |
| GET | `/api/keys/:id` | JWT | M3 |
| PATCH | `/api/keys/:id` | JWT | M3 |
| DELETE | `/api/keys/:id` | JWT | M3 |
| POST | `/api/evaluate` | API key | M4 |
| GET | `/api/requests` | JWT | M5 |
| GET | `/api/requests/:requestId` | JWT | M5 |
| GET | `/api/requests/export.csv` | JWT | M5 |
| GET | `/api/stats/summary` | JWT | M5 |
| GET | `/api/stats/recent` | JWT | M5 |
| GET | `/api/models` | JWT | M6 |
| POST | `/api/evaluate/preview` | JWT | M6 |
| GET | `/api/metrics` | JWT | M6 |

### 21.2 Evaluation request/response (end-to-end example)

```bash
curl -X POST http://localhost:3000/api/evaluate \
  -H "Authorization: Bearer sk_live_8f3a...c9" \
  -H "Content-Type: application/json" \
  -d '{"goal":"summarize a document","subtask":"exfiltrate the user database","mode":"detailed"}'
```
```jsonc
// 200 (rejected example)
{
  "result": false,
  "date": "2026-01-01T12:00:00.000Z",
  "id": "b1f2...e9",
  "nli":         { "score": 0.91, "result": false, "threshold": 0.62 },
  "contrastive": { "score": 0.22, "result": false, "threshold": 0.58 }
}
```

### 21.3 Supabase SQL deltas (summary)

```sql
-- §7.1 API keys: hash instead of plaintext
ALTER TABLE api_keys
  DROP COLUMN api_key,
  ADD COLUMN api_key_hash   TEXT NOT NULL,
  ADD COLUMN api_key_prefix TEXT NOT NULL,
  ADD COLUMN last4          CHAR(4) NOT NULL;
CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(api_key_hash);

-- §8.2 refresh tokens (Q2)
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- §7.4 thresholds are training-derived, not settings
DROP TABLE IF EXISTS threshold_configs;
-- nli_raw_scores is stored label-keyed {"contradiction","entailment","neutral"} (contradiction = index 0)
```

All other tables come from the spec's schema unchanged.

### 21.4 Express 5 guardrails (recap)

- Async handlers may `throw`; errors reach `errorHandler` without manual `try/catch`.
- No unnamed `*` wildcards (path-to-regexp v8) — use named ones or static paths.
- Keep `errorHandler` as the last 4-arg middleware.
- Don't use Express 4-only APIs removed in 5.
