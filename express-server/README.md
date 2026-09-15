# Sentinel Express API

The gateway for the NLI Security Gateway. It handles operator auth, API-key
lifecycle, request logging + stats, and **proxies evaluation requests to the
FastAPI inference service** (`../fastapi`).

- **Full endpoint reference (request/response shapes): [`API.md`](./API.md)**
- Design/plan: [`plan.md`](./plan.md)

---

## 1. Requirements

- **Node.js >= 18** (developed on Node 25; uses the built-in global `fetch`).
- The **FastAPI inference service** running for real evaluations
  (default `http://localhost:8000`). Without it, run Express in **mock mode**
  (§5) so you can still exercise every endpoint.

---

## 2. Install

```bash
cd express-server
npm install
```

---

## 3. Configure

Copy the example env file and adjust if needed:

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Key variables (all optional in development — see `.env.example` for the full list):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port. **4000** is used so it doesn't clash with the Next.js console on 3000. |
| `NODE_ENV` | `development` | `production` enables stricter behaviour. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins. |
| `JWT_SECRET` | *(dev: random)* | **Required in production.** Signing secret for console JWTs. |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `1h` / `7d` | Token lifetimes. |
| `INFERENCE_URL` | `http://localhost:8000` | Base URL of the FastAPI service. |
| `INFERENCE_TIMEOUT_MS` | `5000` | Upstream request timeout. |
| `INFERENCE_MOCK` | `false` | `true` = never call FastAPI; synthesize deterministic scores. |
| `INFERENCE_MOCK_FALLBACK` | `false` | `true` = fall back to mock when a live call fails. |
| `RATE_LIMIT_DEFAULT_PER_MIN` | `60` | Default per-key limit for `/api/evaluate`. |
| `SEED_DEMO` | `true` (non-prod) | Seed a demo user + API key at startup and log them. |

`.env` is loaded automatically (no `dotenv` dependency).

---

## 4. Run

```bash
# production-ish
npm start                 # node src/server.js

# development (auto-restart on file changes)
npm run dev               # node --watch src/server.js
```

Or use the bundled run script (installs deps if missing, then starts):

```bash
./run.sh                  # bash: start
./run.sh dev              # bash: auto-reload
```
```powershell
.\run.ps1                 # PowerShell: start
.\run.ps1 dev             # PowerShell: auto-reload
```

On startup in development the server logs a **demo user and API key**
(`SEED_DEMO=true`). If `JWT_SECRET` is unset a random one is generated — tokens
are then invalidated on restart.

```
{"level":"warn","msg":"demo_seed_created","email":"demo@sentinel.local",
 "password":"demo-password-123","apiKey":"sk_test_..."}
{"level":"info","msg":"server_started","port":4000,"store":"in-memory", ...}
```

---

## 5. Mock mode (no FastAPI running)

Run everything without the inference service:

```bash
# Windows (PowerShell): $env:INFERENCE_MOCK="true"; npm start
INFERENCE_MOCK=true npm run dev
```

`/api/evaluate` then returns deterministic scores derived from
`sha256(goal|subtask)` and sets `modelVersion: "mock"`. `/readyz` reports
`inference: "mocked"`.

---

## 6. Quick start (curl)

```bash
# 1) health
curl http://localhost:4000/healthz
curl http://localhost:4000/readyz

# 2) log in as the seeded demo user  → copy accessToken from the response
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@sentinel.local","password":"demo-password-123"}'

# 3) list your API keys (console JWT required)
TOKEN=<accessToken>
curl -s http://localhost:4000/api/keys -H "Authorization: Bearer $TOKEN"

# 4) evaluate a subtask (use the seeded API key, or one from step 3)
curl -s -X POST http://localhost:4000/api/evaluate \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{"goal":"Process disability benefits for veteran","subtask":"Retrieve medical records","mode":"detailed"}'
```

See [`API.md`](./API.md) for every endpoint and its exact response shape.

---

## 7. Architecture at a glance

```
console (Next.js, :3000) ──Bearer JWT──┐
                                        ▼
                          express-server (:4000)  ──  in-memory store
                                        │
             agents ──API key──▶ /api/evaluate
                                        │
                                        ▼  POST /evaluate
                              fastapi inference (:8000)
```

- **Two auth planes:** console endpoints use a **JWT**; `/api/evaluate` uses an
  **API key** (`sk_test_…` / `sk_live_…`).
- **Two response shapes:** console endpoints use the `{ data, meta }` /
  `{ error }` envelope; `/api/evaluate` returns the spec's flat shape.
- **Storage:** currently **in-memory** (nothing persists across restarts).
  `src/store/index.js` is the seam for swapping in Supabase later.

---

## 8. Project layout

```
express-server/
├─ src/
│  ├─ server.js                # bootstrap (listen, signals, seed)
│  ├─ app.js                   # express app factory (no listen)
│  ├─ config/env.js            # env loading + validation
│  ├─ seed.js                  # dev demo user + API key
│  ├─ lib/                     # errors, crypto, jwt, password, csv, logger
│  ├─ store/                   # in-memory repository (+ Supabase seam)
│  ├─ middleware/              # requestId, logger, auth, apiKey, rateLimit, validate, ...
│  ├─ schemas/                 # zod request schemas
│  ├─ services/                # auth, keys, inference client, evaluation, requests, stats, models
│  └─ routes/                  # route modules (mounted in routes/index.js)
├─ API.md                      # endpoint reference
├─ .env.example
└─ package.json
```

---

## 9. Security notes

- Passwords are hashed with **scrypt** (Node built-in); API keys are stored as
  **sha256 hashes** and shown in plaintext **exactly once** at creation.
- Access logs never include headers, bodies, tokens or keys.
- Rate limiting: strict per-IP on `/api/auth/*`, per-key on `/api/evaluate`.
- The dev seed and mock mode are **development-only** — disable both in production
  (`SEED_DEMO=false`, `INFERENCE_MOCK=false`) and set a real `JWT_SECRET`.
