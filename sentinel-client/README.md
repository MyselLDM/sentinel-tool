# Sentinel Client

Operator console + marketing site for the Sentinel NLI Security Gateway.
Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · daisyUI 5.

The console reads live data from the **Express gateway** (`../express-server`).
The two public proxies (`/api/playground`, `/api/chat`) call the gateway and
DeepSeek **server-side**, so no credential ever reaches the browser.

## Configuration

Copy `.env.example` to `.env.local` (git-ignored) and set:

| Variable | Purpose |
| --- | --- |
| `SENTINEL_API_URL` | Base URL of the Express gateway (default `http://localhost:4000`). |
| `SENTINEL_API_KEY` | API key issued by the gateway — used by the `/api/playground` proxy. **Server-side only.** |
| `DEEPSEEK_API_KEY` | DeepSeek key for the landing-page chat assistant (goal generation). **Server-side only.** Optional `DEEPSEEK_BASE_URL` overrides the default `https://api.deepseek.com`. |

> Tip: run Express with `SEED_DEMO_API_KEY` set so its seeded key stays stable
> across restarts.

Authentication also talks to the same gateway (`POST /api/auth/*`), so the
Express server must be running to sign in or create an account.

## Routes

**Public**

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page — hero, capabilities, how-it-works, the **playground/chatbot**, API teaser, CTA. |
| `/docs` | Public API reference + tutorials. Content in `lib/docs/api-reference.ts`, rendered by `components/docs/*`. |
| `/login` | Auth surface — `Sign in` / `Create account` tabs (daisyUI). `?tab=create` opens on create; `?next=` returns the operator to the page they were bounced from. |

**Console** (`(app)` group — session required, see [Auth](#auth))

| Route | Purpose |
| --- | --- |
| `/dashboard` | Stats summary (total requests, rejection rate, avg latency, active keys) over a `24h`/`7d`/`30d` window, plus the recent-activity feed. |
| `/api-keys` | Issue, rate-limit, rename, activate/deactivate and delete API keys. The plaintext secret is revealed **once**, at creation. |
| `/logs` | Filterable, paginated evaluation log with CSV export; `/logs/[requestId]` is the per-evaluation inspector (score vs. threshold, raw NLI probabilities). |
| `/settings` | Read-only **model info** — live versions, decision rules, trained thresholds and runtime counters. |

**Route handlers** (server-side)

| Route | Purpose |
| --- | --- |
| `/api/playground` | Proxies `{goal, subtask}` → gateway `POST /api/evaluate` with the server-held `SENTINEL_API_KEY`. |
| `/api/chat` | DeepSeek-backed chat assistant that proposes goals for the playground (per-IP rate limit; needs `DEEPSEEK_API_KEY`). |
| `/api/auth/refresh` | Rotates the session token pair when the access token lapses. |

The console routes live under the `(app)` route group and share the **console
shell** (`components/console/console-shell.tsx`): a daisyUI `drawer` with a
navigation sidebar (persistent on `lg+`, off-canvas on mobile) plus a topbar
breadcrumb. Nav entries are defined in `components/console/nav-items.ts`; the
sidebar footer holds the account block and sign-out. `/login` lives under
`(auth)`.

## Data layer

No client data library — **reads are Server Components**, **writes are Server
Actions**, both going through a server-only typed client. Contract:
[`express-server/API.md`](../express-server/API.md).

```
lib/api/client.ts     authenticated fetch wrapper (injects the session token, unwraps `{ data }`)
lib/api/auth.ts       POST /api/auth/{login,register,refresh,me,logout}
lib/api/stats.ts      GET /api/stats/{summary,recent}
lib/api/models.ts     GET /api/models, GET /api/metrics
lib/api/keys.ts       /api/keys list / create / update / delete
lib/api/requests.ts   GET /api/requests, /:requestId, export.csv
lib/api/types.ts      DTO types mirroring the gateway contract
app/(app)/*/actions.ts  Server Actions (create/toggle/delete key, fetch logs, …)
```

## Auth

The console does **not** run its own auth. The gateway issues a short-lived
access JWT plus a rotating refresh JWT; we keep that pair in one httpOnly,
`sameSite=lax` cookie — a stateless session the browser never sees:

```
lib/api/auth.ts     server-side client for POST /api/auth/{login,register,refresh,me,logout}
lib/auth/config.ts  cookie name/options + base64url session codec (shared with proxy.ts)
lib/auth/session.ts read/create/delete the session cookie
lib/auth/dal.ts     getCurrentUser() / verifySession() — the authoritative check
lib/auth/actions.ts sign-out Server Action
proxy.ts            optimistic gate: bounce protected routes to /login (no data fetch)
app/api/auth/refresh/route.ts  rotates the token pair when the access token lapses
```

- **Sign in / up** are Server Actions (`app/(auth)/login/actions.ts`) that
  validate input, call the gateway, set the cookie and redirect to `/dashboard`.
- **The Proxy only checks cookie presence** — the real check is the DAL, which
  validates against `GET /api/auth/me` next to the data (per Next's auth guide).
- **Token refresh** happens in a Route Handler: on a lapsed access token the DAL
  redirects through `/api/auth/refresh`, which rotates the pair (the only place
  allowed to write the cookie outside a Server Action) and returns the operator
  to where they were.

## Design system

A single light daisyUI theme (`sentinel`) — professional blue accent on a
near-white surface. Fonts are loaded via `next/font` in `app/layout.tsx`:
**Inter** for body/UI (`--font-inter`) and **Geist Mono** for labels, IDs, keys,
scores and timestamps (`--font-geist-mono`).

- **Theme + tokens** — `app/globals.css` defines the `sentinel` theme plus a
  `@theme` palette (`--color-page/surface/heading/body/muted/border/
  primary-blue`, …) and helpers (`.label-mono`, `.sentinel-card`,
  `.badge-{accepted,rejected,info,warning,neutral}`).
- **Status** is always icon **and** label **and** colour
  (`components/ui/status-badge.tsx`).
- **Brand** — `components/sentinel-logo.tsx` (`SentinelLogoFull`,
  `SentinelLogoIcon`, `SentinelThinkingIcon`); assets in `public/sentinel-logo-*`.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint    # eslint
```

Start the gateway first (`cd ../express-server && ./run.sh`) so sign-in, the
playground and the console data all work. In development, `/login` also shows the
demo operator seeded by Express (`demo@sentinel.local`).

## Conventions

- **Server-first** — add `"use client"` only on leaves that need state; never on a layout.
- **Secrets are server-only** — `SENTINEL_API_KEY` / `DEEPSEEK_API_KEY` are read
  in route handlers and never in client JS (never under `NEXT_PUBLIC_`).
- **No client-side data library** — initial data is fetched in Server Components.
- **Imports** use the `@/` alias.
