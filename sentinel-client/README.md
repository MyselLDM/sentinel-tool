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
