# Sentinel Client

Operator console + marketing site for the Sentinel NLI Security Gateway.
Next.js (App Router) · Tailwind CSS v4 · daisyUI.

Design system (see [`plan.md`](./plan.md)): a strictly monochrome, outline-driven
white theme. Titles are **DM Serif Display**, body **Space Grotesk**, labels and
data **Geist Mono**.

## Configuration

The landing-page **playground** posts a goal + subtask to `POST /api/playground`,
which proxies to the Express gateway **server-side** (no credential reaches the
browser). Copy `.env.example` to `.env.local` and set:

| Variable | Purpose |
| --- | --- |
| `SENTINEL_API_URL` | Base URL of the Express gateway (default `http://localhost:4000`). |
| `SENTINEL_API_KEY` | API key issued by the gateway — server-side only. |

> Tip: run Express with `SEED_DEMO_API_KEY` set so its seeded key stays stable
> across restarts.

Authentication also talks to the same gateway (`POST /api/auth/*`), so the
Express server must be running to sign in or create an account.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page + playground. |
| `/docs` | **API reference + tutorials** (public). Content lives in `lib/docs/api-reference.ts`. |
| `/login` | **Auth surface** — `Sign in` / `Create account` tabs (daisyUI). `?tab=create` opens on create. |
| `/dashboard` | Console home. |
| `/api-keys` | Console: API keys. |
| `/logs` | Console: evaluation logs. |
| `/settings` | Console: model info. |

`/dashboard`, `/api-keys`, `/logs` and `/settings` live under the `(app)` route
group and share the **console shell** (`components/console/console-shell.tsx`):
a daisyUI `drawer` with a navigation sidebar (persistent on `lg+`, off-canvas on
mobile) plus a topbar breadcrumb. The sidebar footer holds the account block and
sign-out. `/login` lives under `(auth)`.

The three non-dashboard console routes are **routed placeholders** for now — the
gateway endpoints behind them are already live.

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

- **Sign in / up** are Server Actions (`app/(auth)/login/actions.ts`) that validate
  input, call the gateway, set the cookie and redirect to `/dashboard`.
- **The Proxy only checks cookie presence** — the real check is the DAL, which
  validates against `GET /api/auth/me` next to the data (per Next's auth guide).
- **Token refresh** happens in a Route Handler: on a lapsed access token the DAL
  redirects through `/api/auth/refresh`, which rotates the pair (the only place
  allowed to write the cookie outside a Server Action) and returns the operator
  to where they were.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
