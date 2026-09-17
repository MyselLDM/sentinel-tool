# Sentinel

Security gateway for autonomous agents: an agent submits `{goal, subtask}` and two
fine-tuned MiniLM models score the pair — **the subtask is blocked if EITHER model
rejects**. Decisions are logged with their scores.

## Project

Three independently runnable services in a monorepo (no root manifest, no workspaces):

| Dir | Role | Stack | Port |
| --- | --- | --- | --- |
| `sentinel-client` | Marketing site + playground UI | Next.js 16 (App Router), React 19, Tailwind v4, daisyUI 5 | 3000 |
| `express-server` | API gateway: auth, API keys, rate limits, logs, stats, inference proxy | Node, Express 5 (**CommonJS**) | 4000 |
| `fastapi` | Model inference (the only place models run) | Python 3.12, FastAPI, sentence-transformers, torch | 8000 |

Dependency direction: `client → express → fastapi`. Entry points: `app/page.tsx`
(client), `src/server.js` (express), `app/main.py` (fastapi).

`ARCHITECTURE.md` (root) is the authoritative, code-verified overview — read it
before non-trivial work. `full_plan.md` is the original spec (reality diverged
deliberately; see ARCHITECTURE §12).

## Commands

Run from each service's own directory.

```bash
# sentinel-client
npm install && npm run dev      # :3000 (no run.sh)
npm run build                   # production build
npm run lint                    # eslint

# express-server
./run.sh                        # start (:4000); ./run.sh dev for --watch
npm start                       # same, no first-run install handling

# fastapi
./run.sh                        # :8000; creates .venv + installs deps on first run
.venv/bin/python -m pytest -q   # 14 unit tests (preprocess + decision logic)
```

There are currently **no automated tests** for `express-server` or `sentinel-client`.
`express-server/test.js` and `server.js` (root) are stray scratch files, not part of
the app — the real entry point is `express-server/src/server.js`.

## Architecture

- **`fastapi/app/service.py`** — pure inference logic: softmax → `p(contradiction)`,
  cosine similarity, and `combine_decisions` (OR of both verdicts). Models load in
  `models.py`; text framing in `preprocess.py` **must match training exactly**.
- **`express-server/src/routes → services → store`** — strict layering. Routes are
  thin; zod validation lives in `middleware/validate.js`; errors are thrown as
  `AppError` and rendered by the single `middleware/errorHandler.js`.
- **`express-server/src/store/index.js`** — the persistence seam. Today
  `memory.js` is in-memory (nothing survives restart); a Supabase store implements
  the same method surface here.
- **`express-server/src/services/inference.client.js`** — the single place the
  gateway calls FastAPI (5s timeout, 1 retry; can degrade to mock scores).
- **`fastapi/model_config.json`** — model dirs, label order, and thresholds.
  Thresholds are **placeholders (`0.5`)** until training outputs are merged.

## Conventions

- **express-server**: CommonJS (`require`/`module.exports`), `'use strict'`. Layer
  `route → service → store`; never reach into the store from a route. Throw
  `AppError` (never `res.status().json()` for errors in services). Console
  endpoints return `{ data, meta? }`; errors `{ error: { code, message, details? } }`.
  `POST /api/evaluate` is the deliberate exception (flat spec response).
- **fastapi**: French-style clean split — `service.py` holds pure functions (no
  FastAPI imports) so it stays unit-testable; routers stay thin. Preprocessing must
  stay parity with the training scripts in `old-training/`.
- **sentinel-client**: App Router + server components; data is fetched via RSC /
  route handlers (no React Query). Secrets are **server-side only** — the playground
  key lives in `SENTINEL_API_KEY`, never in client JS.
- **Styling (client)**: strictly monochrome, outline-driven white theme. Titles
  **DM Serif Display**, body **Space Grotesk**, labels/data **Geist Mono**. Division
  is by 1px hairlines, never fills or shadows; `.bg-hatch` is the page base texture.
- **Security invariants**: API keys stored as sha256 (plaintext shown once);
  passwords scrypt; every console read/write scoped to `req.user.id` (cross-user
  access returns **404**, not 403). Don't log headers, bodies, tokens, or keys.
- **Scripts**: keep `*.sh` LF and `*.ps1` CRLF (enforced by `.gitattributes`).
- **Do not hand-edit `sentinel-client/AGENTS.md`'s `BEGIN:nextjs-agent-rules`
  block** — `next dev` regenerates it.

## Notes

<!-- Add quick, durable facts here as you learn them. -->
