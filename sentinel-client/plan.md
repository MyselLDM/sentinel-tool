# Sentinel Client — Frontend & Style Plan

> **Status:** Draft for review (nothing here is built yet).
> **Owner:** sentinel-client
> **Scope:** Full frontend plan — design system, information architecture, pages, data layer, auth, conventions, and build order.
> **Source of truth for product intent:** [`../Thesis Tool Plan.md`](../Thesis%20Tool%20Plan.md) (the NLI Security Gateway spec).

This document is the plan for the **`sentinel-client`** React surface of the NLI Security Gateway. It is written to be actionable: every section ends in concrete files, components, or tasks. Where the original spec and the real stack disagree, the real stack wins (see [§1.3](#13-stack-reality-vs-the-original-spec)).

---

## Table of Contents

1. [Context & Constraints](#1-context--constraints)
2. [Design System / Style Plan](#2-design-system--style-plan)
3. [Information Architecture & Routing](#3-information-architecture--routing)
4. [Page Specifications](#4-page-specifications)
5. [Data Layer (Next.js native)](#5-data-layer-nextjs-native)
6. [Auth Plan](#6-auth-plan)
7. [Shared Component Library](#7-shared-component-library)
8. [File Structure](#8-file-structure)
9. [Conventions & Guardrails](#9-conventions--guardrails)
10. [Build Order / Milestones](#10-build-order--milestones)
11. [Decisions Log & Open Questions](#11-decisions-log--open-questions)
12. [Appendix: Theme Snippet, daisyUI Mapping, Tokens](#12-appendix)

---

## 1. Context & Constraints

### 1.1 What the product is

A security evaluation service: an agent submits a `goal` + `subtask`, and a **dual-model** verifier decides whether the subtask is aligned with the authorized goal.

- **NLI model** (`cross-encoder/nli-MiniLM2-L6-H768`) → returns **label-keyed** scores `{contradiction, entailment, neutral}` (contradiction = index **0**); reject when `p(contradiction) > nli_threshold` (F1-tuned in training).
- **Contrastive model** (`all-MiniLM-L12-v2`) → cosine similarity of a framed `"Goal: …. Subtask: …."` pair; reject when `similarity < contrastive_threshold` (F1-optimal from training).
- **Decision:** REJECT if **either** model rejects (`nli_reject` / `contrastive_reject` / `both_reject`).

The frontend is the **operator console** for that service: authenticate, issue/manage API keys, watch traffic, inspect individual evaluations, and review the live models.

### 1.2 What the console must do (from the spec)

After login, five surfaces:

1. **Login / Create Account** — email + password, tie the user to their own data.
2. **Dashboard** — summary stats (total requests, rejection rate, avg response time) + recent activity feed (last 10).
3. **API Key Management** — create (generate + name + rate limit), list with status, deactivate/delete, copy to clipboard.
4. **Logs Viewer** — table with filters (date range, accepted/rejected, search by request ID), row → detail, export CSV.
5. **Model Info** — show live model versions, training-derived thresholds, and metrics (read-only).

### 1.3 Stack reality vs. the original spec

The spec's **Frontend** section lists *React + Vite + React Router + React Query + Tailwind*. The actual `sentinel-client` is different and this plan targets the real thing:

| Concern | Spec said | **Reality — this plan uses** |
| --- | --- | --- |
| Framework | React + Vite | **Next.js 16.3.5 (App Router)** |
| Routing | React Router | **App Router file-based routing** (route groups) |
| Data | React Query | **Server Components + `fetch` + Server Actions** (decision D2) |
| Styling | Tailwind | **Tailwind CSS v4 + daisyUI 5.7.38** |
| Auth | Supabase | *Open question* — see Q1 |

> **Action:** treat the spec's "Frontend Pages" list as the requirement and everything else in that section as superseded.

### 1.4 Environment (verified)

Verified in this workspace on the day this plan was written:

- `daisyui@5.7.38` is installed (`node_modules/daisyui`) and declared in `package.json`.
- Tailwind is wired the **v4** way: `app/globals.css` starts with `@import "tailwindcss";` then `@plugin "daisyui";`, and `postcss.config.mjs` uses `@tailwindcss/postcss`.
- `next@16.3.5`, `react@19.2.8`, `react-dom@19.2.8`, `typescript@5`, `eslint-config-next@16.3.5`.
- `tsconfig.json` alias: `@/*` → repo root of the client.
- No `src/` folder — the app lives in `app/` at the client root.

**Next.js 16 gotchas that shape this plan** (this Next differs from older training data):

- **Middleware is renamed to `proxy.ts`** (root-level, single file). "Middleware" as a name no longer exists.
- `cookies()`, `headers()`, `draftMode()` are **async** — always `await`.
- Dynamic route `params`/`searchParams` are **Promises** in pages.

### 1.5 Non-goals (for now)

- Server/API implementation (the Express/FastAPI services are currently empty stubs).
- Building the inference models.
- Theming beyond one built-in daisyUI theme (custom brand theme is a later task).

---

## 2. Design System / Style Plan

This is the heart of the document. The console is a **data-dense, trust-critical security tool**: it must read as calm, precise, and legible at a glance, with unambiguous pass/fail signaling.

### 2.1 Styling philosophy

1. **Server-first, style-light.** Most UI is Server Components; styling is static Tailwind + daisyUI classes, so nothing ships to the client that doesn't have to.
2. **Semantic color, not decorative color.** Color encodes *meaning* (accepted / rejected / borderline), never decoration. See [§2.4](#24-semantic-color-contract).
3. **daisyUI for structure, Tailwind for layout.** Use daisyUI components (`card`, `btn`, `table`, `stat`, `badge`) for the primitives; use Tailwind utilities (`flex`, `grid`, `gap-*`) for arrangement.
4. **Thin wrappers, one source of truth.** No raw daisyUI class strings scattered across pages. Every repeated pattern gets a typed wrapper component ([§7](#7-shared-component-library)).
5. **Density with air.** Security consoles show a lot of rows; default to comfortable-but-compact spacing, `table-sm`/`table-zebra`, and clear separators over heavy borders.

### 2.2 Theme strategy

**Decision (D1): ship one built-in daisyUI theme, tweak later.**

- **Default theme: `night`** — a dark, cool-toned theme (`base-100` ≈ dark slate-blue, cyan/teal `primary`). It fits a security/observability tool and gives strong contrast for status colors.
- Wire it by making `night` the default instead of the current light+dark auto pair:

  ```css
  /* app/globals.css */
  @import "tailwindcss";
  @plugin "daisyui" {
    themes: night --default;
  }
  ```

  (`themes: night --default;` is the daisyUI 5 syntax; the plugin's implicit default is `light --default, dark --prefersdark`, which is why we must set it explicitly.)
- **Later / optional:** add `light` (`themes: night --default, light;`) and a `theme-controller` toggle, or define a custom `sentinel` theme via `@plugin "daisyui/theme" { ... }`. Do **not** block v1 on a custom theme.

### 2.3 Design tokens

Token decisions, expressed as the daisyUI variables + Tailwind utilities we standardize on:

| Token | Choice | Notes |
| --- | --- | --- |
| **Type — UI** | Geist Sans | Already loaded in `app/layout.tsx` as `--font-geist-sans`. |
| **Type — data** | Geist Mono | `--font-geist-mono`. **All IDs, API keys, scores, thresholds, timestamps** use mono. |
| **Radii** | daisyUI theme defaults (`--radius-box/field/selector`) | Don't hand-roll radius; use `rounded-box`, `rounded-field`, `rounded-selector`. |
| **Borders** | `1px`, daisyUI `--border` | Prefer `border-base-300` / `divide-base-300`. |
| **Elevation** | daisyUI `shadow-sm`/`shadow-md` on cards only | Tables/rows stay flat. |
| **Spacing scale** | Tailwind default; page gutter `px-4 md:px-6 lg:px-8`; section gap `gap-6` | Consistent rhythm. |
| **Max content width** | `max-w-7xl mx-auto` for app pages | Login is a narrower `max-w-sm` centered card. |
| **Focus** | daisyUI's built-in focus rings; never remove outlines | Accessibility (§2.7). |

> **Fix needed:** current `globals.css` sets `body { font-family: Arial, Helvetica, sans-serif; }`, which overrides Geist. Replace with `font-sans`/`var(--font-sans)` and drop the hard-coded `background`/`color` on `body` (let the daisyUI theme own `base-100`/`base-content`).

### 2.4 Semantic color contract

This mapping is **normative** — every status in the UI uses these, everywhere.

| Domain meaning | daisyUI token | Typical usage |
| --- | --- | --- |
| Accepted / aligned / healthy | `success` | Accepted badge, positive NLI result, healthy key |
| Rejected / misaligned / danger | `error` | Rejected badge, contradiction, deactivated key |
| Borderline / near threshold / caution | `warning` | Score within ε of threshold, rate-limit near-exhausted |
| Neutral / informational | `info` | Info alerts, "no data yet" hints |
| NLI model identity | `primary` | NLI score bar/badge, NLI column tint |
| Contrastive model identity | `secondary` | Contrastive score bar/badge |
| Muted / disabled | `base-content/60`, `base-300` | Timestamps, secondary labels, disabled rows |

**Rule:** acceptance/rejection is never communicated by color alone — always pair with an icon **and** a text label (e.g. `✓ Accepted` / `✕ Rejected`). See [§2.7](#27-accessibility).

### 2.5 Typography scale

| Role | Classes | Use |
| --- | --- | --- |
| Page title | `text-2xl font-semibold tracking-tight` | One per page (`PageHeader`). |
| Section title | `text-lg font-medium` | Card headings, tabs. |
| Body | `text-sm` (default app size) | Tables, forms, feed. |
| Caption / meta | `text-xs text-base-content/60` | Timestamps, helper text, stat descriptions. |
| Data / code | `font-mono text-xs` | IDs, keys, scores, JSON. |

Root `body` defaults to `text-sm` for console density; headings scale up from there.

### 2.6 Layout system (app shell)

Authenticated pages share one shell (`(app)/layout.tsx`):

```
┌──────────────────────────────────────────────────────────┐
│ Topbar (navbar): breadcrumb · spacer · user menu · theme │
├───────────────┬──────────────────────────────────────────┤
│ Sidebar       │  <main> page content (max-w-7xl)         │
│ (menu)        │                                          │
│ · Dashboard   │  PageHeader                              │
│ · API Keys    │  ──────────────────────────────────      │
│ · Logs        │  ...page sections...                     │
│ · Settings    │                                          │
└───────────────┴──────────────────────────────────────────┘
```

- **Sidebar:** daisyUI `drawer` + `menu` — persistent on `lg+`, off-canvas on mobile via `drawer-toggle`. Active item uses `menu-active`.
- **Topbar:** daisyUI `navbar` (`navbar-start` breadcrumb, `navbar-end` user dropdown).
- **Breakpoints:** mobile-first. Sidebar collapses `< lg`. Tables get horizontal scroll (`overflow-x-auto`) or a card-list fallback on small screens (decision per page in [§4](#4-page-specifications)).

### 2.7 Accessibility

- **Contrast:** rely on the daisyUI theme's paired `*-content` colors (`text-primary-content` on `bg-primary`), never guess foregrounds.
- **Never color-only:** status = icon + label + color.
- **Forms:** every input inside a `fieldset` with a `label`; error text via `validator`/`label` in `text-error`.
- **Focus:** keep daisyUI focus rings; keyboard-navigable `menu`, `modal`, `dropdown` for free.
- **Motion:** respect `prefers-reduced-motion` for any skeleton/transition.

### 2.8 Component→daisyUI map (verified against 5.7.38)

daisyUI v5 removed `*-bordered` modifiers (borders are on by default) and has **no `pagination`/`tabs`** components — use `tab` and `join` (a utility) respectively.

| UI need | daisyUI classes |
| --- | --- |
| Primary/secondary/danger buttons | `btn`, `btn-primary`, `btn-ghost`, `btn-error`, `btn-sm` |
| Containers | `card`, `card-body`, `card-title`, `card-actions` |
| Sidebar nav | `drawer`, `drawer-side`, `drawer-content`, `menu`, `menu-active` |
| Topbar | `navbar`, `navbar-start`, `navbar-end` |
| Stat tiles | `stats`, `stat`, `stat-title`, `stat-value`, `stat-desc`, `stat-figure` |
| Status pills | `badge`, `badge-success`, `badge-error`, `badge-warning`, `badge-ghost` |
| Tables | `table`, `table-zebra`, `table-pin-rows`, `table-sm` |
| Tabbed detail | `tab`, `tabs-box` |
| Inline alerts | `alert`, `alert-error`, `alert-success`, `alert-warning` |
| Inputs | `input`, `select`, `textarea`, `checkbox`, `toggle`, `range`, `fieldset`, `label` |
| Segmented control / pager | `join`, `join-item` |
| Loading | `loading`, `loading-spinner`, `skeleton` |
| Dots / status | `status`, `status-success`, `status-error` |
| Confirmations | `modal`, `modal-box`, `modal-action` |
| Menus / user menu | `dropdown`, `dropdown-content`, `menu` |
| Copy-to-clipboard hint | `tooltip` |
| Toasts | `toast`, `alert` |

Full list of the 61 available component classes lives in `node_modules/daisyui/components/`.

### 2.9 Styling conventions

- **Class ordering:** layout → box → typography → color → state (`flex items-center gap-2 p-4 text-sm text-base-content/60`).
- **No arbitrary values** for colors/spacing unless there's a real reason; use theme tokens so a future theme swap is a one-file change.
- **Conditional classes** via a `cn()` helper (`clsx` + `tailwind-merge`) — to be added. Keeps variant logic readable and dedupes Tailwind conflicts.
- **One wrapper per repeated pattern**; pages should read like composition, not class soup.
- **Never** use removed v5 modifiers (`input-bordered`, `select-bordered`, `btn-outline` still exists but prefer `btn-ghost`/`btn-soft` per context).

---

## 3. Information Architecture & Routing

### 3.1 Route map

| Route | Group | File | Auth | Purpose |
| --- | --- | --- | --- | --- |
| `/` | — | `app/page.tsx` | — | Redirect → `/dashboard` (or marketing later). |
| `/login` | `(auth)` | `app/(auth)/login/page.tsx` | public | Login **and** create-account (single surface, tabs). |
| `/dashboard` | `(app)` | `app/(app)/dashboard/page.tsx` | required | Stats + recent activity. |
| `/api-keys` | `(app)` | `app/(app)/api-keys/page.tsx` | required | Key CRUD. |
| `/logs` | `(app)` | `app/(app)/logs/page.tsx` | required | Filterable request table. |
| `/logs/[requestId]` | `(app)` | `app/(app)/logs/[requestId]/page.tsx` | required | Evaluation detail. |
| `/settings` | `(app)` | `app/(app)/settings/page.tsx` | required | Model info (read-only). |

### 3.2 Route groups

- **`(auth)`** — public, no app shell, centered card layout + its own `layout.tsx`.
- **`(app)`** — protected. Its `layout.tsx` (a) verifies the session and redirects to `/login` if absent, and (b) renders the app shell (sidebar + topbar). Every page under it inherits auth + chrome.

Route groups don't affect the URL — `(app)/dashboard/page.tsx` still serves `/dashboard`.

### 3.3 Per-route conventions

Each route folder can have:

- `page.tsx` — the page (Server Component by default).
- `loading.tsx` — route-level skeleton (daisyUI `skeleton`).
- `error.tsx` — route-level error boundary (`alert alert-error` + retry).
- `actions.ts` — `"use server"` mutations for that route.
- `_components/` — route-local (private) components; the `_` prefix opts the folder out of routing.

---

## 4. Page Specifications

For each page: purpose, layout, daisyUI pieces, data, mutations, and the **loading / empty / error** states (which are the ones most often forgotten).

### 4.1 Login / Create Account — `/login`

- **Purpose:** authenticate or create an account; the entry point.
- **Layout:** centered `hero`/`card` (`max-w-sm`), brand mark, then a `tab` switcher: **Sign in** | **Create account**. Fields in a `fieldset`; primary `btn` full-width; error via `alert alert-error`.
- **Fields:** email, password; on create: confirm password, optional full name.
- **Data:** none (form only).
- **Mutations:** `loginAction` / `signupAction` Server Actions → set session cookie → `redirect('/dashboard')`.
- **States:**
  - *Idle:* form.
  - *Submitting:* button `loading loading-spinner`.
  - *Error:* inline `alert alert-error` with a non-leaky message.
- **Notes:** single surface for both flows reduces routing and matches the spec ("create if no user").

### 4.2 Dashboard — `/dashboard`

- **Purpose:** at-a-glance health of the gateway.
- **Layout:**
  1. `PageHeader` ("Dashboard", subtitle with account/key scope).
  2. **Stat row** — daisyUI `stats`: *Total requests*, *Rejection rate (%)*, *Avg response time (ms)*, optionally *Active keys*. Each `stat` with `stat-title` + `stat-value` + `stat-desc` (e.g. "last 24h").
  3. **Recent activity** — `card` containing a `table` of the **last 10** requests: time, request ID (mono), short goal/subtask, result badge, response time.
- **Data (server-read):** `getDashboardSummary(scope)` and `getRecentRequests(10)`.
- **Mutations:** none.
- **States:**
  - *Loading:* `loading.tsx` with `stats`/`table` skeletons.
  - *Empty:* `EmptyState` — "No evaluations yet" + a hint to create an API key.
  - *Error:* `error.tsx` boundary.

### 4.3 API Key Management — `/api-keys`

- **Purpose:** issue and manage credentials.
- **Layout:** `PageHeader` + **"Create key"** button → `modal` (name, rate limit/min, optional expiry) → on success, show the generated key **once** in a `CopyField` with a "copy" `tooltip`. Below: a `table` of keys — name, masked key, status (`badge`/`status`), rate limit, last used, created, row actions (deactivate/reactivate, delete).
- **Data:** `listApiKeys()`.
- **Mutations (Server Actions):** `createApiKey`, `updateApiKeyStatus`, `deleteApiKey`. Destructive actions gated by a confirm `modal`; revalidate `/api-keys`.
- **Interactions:** copy-to-clipboard (`navigator.clipboard`), optimistic status toggle via `useTransition`, disabled/`loading` buttons during mutations.
- **States:** loading (table skeleton), empty ("No keys yet — create one"), error; per-row pending state.
- **Security notes:** only show the raw key **once** at creation; afterwards display a masked value; never log it client-side.

### 4.4 Logs Viewer — `/logs`

- **Purpose:** browse and inspect all evaluation requests.
- **Layout:**
  1. `PageHeader` with an **Export CSV** button.
  2. **Filter bar** (`card` or `navbar`-ish row): date range (from/to `input type="date"`), status `select` (All / Accepted / Rejected), request-ID search `input`, **Apply**/**Reset**. Filters live in the **URL query string** so views are shareable/bookmarkable.
  3. **Table** (`table-zebra table-pin-rows`): time, request ID, result badge, NLI score, contrastive score, response time, mode. Row click → `/logs/[requestId]`.
  4. **Pagination** via `join` + `btn` (`Prev / page x of y / Next`).
- **Data:** `listRequests(filters, page)` — server-read; filtering/pagination driven by `searchParams` (a Promise in Next 16).
- **Detail page `/logs/[requestId]`:** `card` with goal/subtask, both models' **ScoreMeter**s (score vs threshold), raw NLI scores keyed by label (`contradiction`/`entailment`/`neutral`), rejection reason, metadata (user agent, model version, mode, response time). Raw NLI scores in a mono/`collapse`.
- **Export CSV:** route handler (`app/(app)/logs/export/route.ts`) that streams CSV from the same query, honoring current filters.
- **States:** loading (row skeletons), empty (no matches — suggest widening filters), error; not-found for unknown request ID.

### 4.5 Model Info — `/settings`

> **Adjusted after reading the training code:** thresholds are **determined by training** (F1-tuned) and are **not user settings**, so this page is **read-only**. See [`../fastapi/plan.md`](../fastapi/plan.md) and [`../express-server/plan.md`](../express-server/plan.md) §9.5.

- **Purpose:** show which models are live and how they decide — not to tune them.
- **Layout:** two `card`s — **NLI** and **Contrastive** — each showing: base model, version, decision rule (e.g. `p(contradiction) > 0.62`), the trained **threshold** (mono), and training **metrics** (TPR/FPR/F1) as read-only `StatCard`s or a small `table`. An `alert alert-info` explains that thresholds come from training.
- **Data:** `getModelInfo()` (`GET /api/models`, read-only, proxied from the inference service).
- **Mutations:** **none.** (The `threshold_configs` write path is dropped; see §5.)
- **Optional:** an "Evaluate preview" panel (`POST /api/evaluate/preview`) to run an ad-hoc goal/subtask with an experimental **threshold override** without persisting — clearly marked *experimental*.
- **States:** loading (card skeleton), stale (`alert alert-warning` when the inference service is unreachable and Express returns last-known config), error.

---

## 5. Data Layer (Next.js native)

**Decision (D2): no client data library.** Use App Router primitives — **Server Components for reads, Server Actions for writes** — instead of React Query/SWR.

### 5.1 Read path (Server Components)

- Pages are async Server Components that call a **typed API client** and render data directly — no client fetch, no waterfall on the client.
- Data access is centralized in `lib/api/` (one module per resource: `requests.ts`, `keys.ts`, `models.ts`, `stats.ts`), each returning **DTOs** shaped for the UI (not raw backend rows).
- Wrap slow/independent reads in `<Suspense>` with daisyUI `skeleton` fallbacks; use `loading.tsx` for the route-level default.

### 5.2 Write path (Server Actions)

- Mutations live in colocated `actions.ts` files marked `"use server"`.
- Shape: `validate input → call API client → revalidatePath(...) → return ActionResult`.
- Return a discriminated result (`{ ok: true, data } | { ok: false, error }`) so forms can render inline errors without throwing.
- From client components, invoke via `useTransition` for pending UI; use `<form action={...}>` where possible for progressive enhancement.

### 5.3 Caching & revalidation

- Default reads to no-store-ish freshness for operator data (this is live traffic); use `revalidatePath` after each mutation to refresh affected routes (`/dashboard`, `/logs`, `/api-keys`, `/settings`).
- If we later want per-segment caching, adopt `revalidateTag` with resource tags (`requests`, `keys`, `models`).

### 5.4 Validation & types

- **Input validation:** add `zod` (small, ergonomic) for Server Action inputs and URL `searchParams`. *Open question Q4.*
- **Types:** hand-write `lib/api/types.ts` mirroring the backend contract (goal/subtask, scores, model info, statuses). Generate from the backend later if an OpenAPI spec appears.

### 5.5 Config

- Backend base URL via `NEXT_PUBLIC_*` (client-safe) / server-only env (`process.env.API_BASE_URL`). No secrets in `NEXT_PUBLIC_*`.

---

## 6. Auth Plan

Goal: authenticated operators, each scoped to their own keys/logs, with the least machinery possible.

### 6.1 Approach (proposed — see Q1)

**Stateless session in an httpOnly cookie**, following the Next.js auth guide's shape:

- `lib/auth/session.ts` — `createSession` / `getSession` / `deleteSession`; encrypt/sign a session payload into an httpOnly, `secure`, `sameSite=lax` cookie.
- `lib/auth/dal.ts` — a **Data Access Layer** with `verifySession()` (memoized) that every protected read flows through. Centralizing auth in a DAL prevents accidental unauthenticated reads.
- `app/(app)/layout.tsx` — calls `verifySession()`; redirects to `/login` when absent (defense in depth alongside the DAL).

### 6.2 Optimistic checks — `proxy.ts` (not "middleware")

- Next 16 renamed Middleware to **Proxy**. Add a root `proxy.ts` doing **optimistic** checks only: redirect unauthenticated users away from `/(app)` routes and authenticated users away from `/login`.
- Proxy is **not** the authorization boundary (per Next docs) — the DAL/route checks remain authoritative.
- Note: `cookies()` is **async** — `const store = await cookies()`.

### 6.3 Login/signup

- Server Actions (`loginAction`, `signupAction`) validate input, authenticate, set the session cookie, and `redirect('/dashboard')`.
- Errors are generic ("Invalid email or password") to avoid account enumeration.

### 6.4 Relationship to Supabase

The spec assumes Supabase (Postgres + Auth). Whether the console uses **Supabase Auth** or a **custom session + our own `users` table** depends on the still-empty backend. This plan is written to work with either: the session/DAL seam above is provider-agnostic. **Flagged as Q1.**

---

## 7. Shared Component Library

Thin, typed wrappers over daisyUI (decision D3). Proposed inventory under `components/`:

| Component | Wraps | Purpose |
| --- | --- | --- |
| `AppShell` | `drawer` + `navbar` | Sidebar + topbar frame for `(app)`. |
| `Sidebar` / `SidebarItem` | `menu`, `menu-active` | Primary nav. |
| `PageHeader` | — | Title + subtitle + action slot. |
| `Card` | `card`, `card-body` | Standard container. |
| `Button` | `btn` (+ variants) | Typed `variant`/`size`/`loading`. |
| `StatCard` | `stat` | Metric tile. |
| `StatusBadge` | `badge` | Maps Accepted/Rejected/Borderline → `success`/`error`/`warning` + icon + label. |
| `DataTable` | `table` | Columns config, zebra/pin-rows, empty slot. |
| `Pagination` | `join` + `btn` | URL-driven pager. |
| `FilterBar` | `join`, `input`, `select` | URL-query filter row. |
| `ScoreMeter` | `progress`/`radialprogress` | Score vs threshold visualization. |
| `ModelInfoCard` | `card` + `stat`/`table` | Read-only model version, decision rule, trained threshold, and metrics. |
| `CopyField` | `join` + `tooltip` | Masked value + copy button. |
| `EmptyState` | `hero`/`alert` | Consistent "nothing here" + CTA. |
| `ConfirmDialog` | `modal` | Destructive-action gate. |
| `Toast` | `toast`, `alert` | Mutation feedback. |
| `CodeBlock` | — | Mono, for JSON/raw scores. |
| `ThemeToggle` | `swap`/`toggle` | Only if we add a 2nd theme (§2.2). |

Also: `lib/utils/cn.ts` (`clsx` + `tailwind-merge`).

---

## 8. File Structure

Proposed target layout (additions marked `＋`):

```
sentinel-client/
├─ app/
│  ├─ layout.tsx                     # root: fonts, metadata, theme
│  ├─ globals.css                    # tailwind + daisyUI theme  (✎ edit)
│  ├─ page.tsx                       # ✎ redirect → /dashboard
│  ├─ (auth)/
│  │  ├─ layout.tsx                  # ＋ centered card shell
│  │  └─ login/page.tsx              # ＋ login/create
│  └─ (app)/
│     ├─ layout.tsx                  # ＋ verifySession + AppShell
│     ├─ dashboard/page.tsx          # ＋
│     ├─ api-keys/page.tsx           # ＋
│     ├─ logs/
│     │  ├─ page.tsx                 # ＋ list
│     │  ├─ [requestId]/page.tsx     # ＋ detail
│     │  └─ export/route.ts          # ＋ CSV
│     └─ settings/page.tsx           # ＋
├─ components/                       # ＋ shared wrappers (§7)
│  └─ ui/…
├─ lib/
│  ├─ api/{client,requests,keys,models,stats,types}.ts  # ＋
│  ├─ auth/{session,dal}.ts          # ＋
│  └─ utils/{cn,format,csv}.ts       # ＋
├─ proxy.ts                          # ＋ optimistic auth only
├─ next.config.ts
├─ postcss.config.mjs
├─ tsconfig.json
└─ package.json
```

Dependencies to add: `clsx`, `tailwind-merge`; likely `zod` (Q4). Nothing else is required by the chosen architecture.

---

## 9. Conventions & Guardrails

- **Imports:** always via the `@/` alias (`@/components/ui/Button`).
- **Server-first:** add `"use client"` only on leaves that need state/effects/handlers. Never on a layout.
- **No client-side data fetching** for initial data (D2) — read in Server Components.
- **Pages compose wrappers**; they don't hand-write repeated daisyUI class strings.
- **Semantic colors only** — never raw hex in components.
- **Every async route has** a `loading.tsx` (or `<Suspense>`) and an `error.tsx`.
- **Every list has** an `EmptyState`.
- **Every destructive action** has a `ConfirmDialog`.
- **Filters/pagination live in the URL** (`searchParams`), not component state.
- **Accessibility:** icon + label + color for status; labeled fields; keep focus rings.
- **Naming:** components `PascalCase.tsx`; modules `kebab-case.ts`; Server Actions `verbNoun` (`createApiKey`).
- **Don't** use daisyUI v5-removed modifiers (`*-bordered`).
- **`next dev` note:** the repo has a `BEGIN:nextjs-agent-rules` block in `AGENTS.md` that Next re-adds; commit it with our changes so the tree stays clean.

---

## 10. Build Order / Milestones

Sequenced so each milestone is independently demoable.

**M1 — Foundation**
1. Edit `globals.css`: set `night` as default theme; fix `body` font to Geist; drop forced light/dark.
2. Root `layout.tsx`: real `metadata` ("Sentinel — NLI Security Gateway"), keep fonts.
3. Add `clsx` + `tailwind-merge`; create `lib/utils/cn.ts`.
4. Build the base wrappers: `Button`, `Card`, `PageHeader`, `StatusBadge`, `EmptyState`.

**M2 — App shell + auth surface**
5. `(auth)/layout.tsx` + `login/page.tsx` (form UI, no backend yet).
6. `AppShell` (`drawer` + `navbar`) + `Sidebar`; `(app)/layout.tsx`.
7. `proxy.ts` optimistic redirect; `lib/auth/*` seam (stubbed until Q1 resolves).

**M3 — Core pages (UI-first, mock data)**
8. `DataTable`, `StatCard`, `ScoreMeter`, `Pagination`, `FilterBar`.
9. Dashboard, API Keys, Logs (+ detail), Settings — built against typed mock data so UX can be reviewed before the backend exists.

**M4 — Wire the data layer**
10. `lib/api/*` typed client; convert mocks → real reads.
11. Server Actions for keys; `revalidatePath`; toasts. (Model info is read-only.)
12. Logs CSV export route handler; URL-driven filters/pagination.

**M5 — Polish**
13. loading/error/empty states audit across every route.
14. Accessibility pass (contrast, labels, keyboard, reduced-motion).
15. Responsive/mobile pass (table ↔ card fallbacks).

---

## 11. Decisions Log & Open Questions

### Decisions (locked)

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Theme identity | Built-in daisyUI theme (`night`), tweak later. |
| D2 | Data layer | Next.js App Router native — RSC + `fetch` + Server Actions. |
| D3 | Component strategy | Thin local wrappers over daisyUI. |
| D4 | Plan scope | Full frontend plan (this document). |

### Open questions

- **Q1 — Auth provider.** Supabase Auth vs custom sessions + our `users` table. Blocks `lib/auth/*` and `proxy.ts` finalization. *Proposed default: custom stateless session cookie (provider-agnostic seam).*
- **Q2 — Backend contract.** The Express/FastAPI services are empty. We need concrete endpoints/DTOs for `requests`, `keys`, `models`, `stats` before M4. *Proposed default: define the contract in `lib/api/types.ts` and mock against it.*
- **Q3 — Data-fetch/client library.** *Resolved:* none (D2). Revisit only if we need heavy client polling.
- **Q4 — Validation lib.** Add `zod` for Server Action inputs + `searchParams`? *Proposed default: yes.*
- **Q5 — Multi-theme.** Single `night` for v1, or ship `light` + toggle now? *Proposed default: single theme now, add later.*
- **Q6 — Product name/brand.** "Sentinel" vs the spec's "NLI Security Gateway" — pick the displayed name for metadata/nav.

---

## 12. Appendix

### 12.1 Theme wiring snippet

```css
/* app/globals.css */
@import "tailwindcss";
@plugin "daisyui" {
  themes: night --default;
}

/* Let the daisyUI theme own surface colors; only set the font stack. */
body {
  font-family: var(--font-sans);
}
```

(Removes the current `Arial` override and the forced `--background`/`--foreground` + `prefers-color-scheme: dark` block, which fight the theme.)

### 12.2 Verified daisyUI 5.7.38 class surface

Available components (61): `alert aura avatar badge breadcrumbs button calendar card carousel chat checkbox collapse countdown diff divider dock drawer dropdown fab fieldset fileinput filter footer hero hover3d hovergallery indicator input kbd label link list loading mask megamenu menu mockup modal navbar otp progress radialprogress radio range rating select skeleton stack stat status steps swap tab table textarea textrotate timeline toast toggle tooltip validator`. Plus utilities: `join`, `radius`, `glass`, `typography`.

Removed/absent, do **not** use: any `*-bordered` modifier; there is no `pagination` or `tabs` component (`tab` + `join` cover those).

### 12.3 Status → color reference

| Status | Token | Icon | Label |
| --- | --- | --- | --- |
| Accepted | `success` | ✓ | "Accepted" |
| Rejected | `error` | ✕ | "Rejected" |
| Borderline (ε of threshold) | `warning` | ! | "Borderline" |
| Key active | `success` (`status-success`) | • | "Active" |
| Key disabled | `base-content/50` | • | "Disabled" |
| NLI model | `primary` | — | "NLI" |
| Contrastive model | `secondary` | — | "Contrastive" |

### 12.4 Thresholds & decision rule (from training, read-only)

Thresholds are **not** constants the console owns — they are produced by training and served read-only via `GET /api/models`:

- NLI: reject when `p(contradiction) > nli_threshold` (label order `[contradiction, entailment, neutral]`; contradiction = index **0**).
- Contrastive: reject when `cosine_similarity < contrastive_threshold`.
- `DECISION = reject if EITHER rejects`.

Example trained values (from `model_config.json`): `nli ≈ 0.62`, `contrastive ≈ 0.58`. The console displays the live values; it never hard-codes them.

These are the initial values shown/reset in Settings.
