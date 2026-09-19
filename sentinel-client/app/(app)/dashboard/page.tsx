import type { Metadata } from "next";

import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { signOut } from "@/lib/auth/actions";
import { verifySession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Dashboard — Sentinel",
};

const UPCOMING = [
  { title: "API keys", body: "Issue, rate-limit and revoke keys." },
  { title: "Logs", body: "Every evaluation, filterable and CSV-exportable." },
  { title: "Model info", body: "Which models are live and how they decide." },
];

export default async function DashboardPage() {
  const user = await verifySession();
  const displayName = user.fullName ?? user.email;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div>
        <Eyebrow>Console</Eyebrow>
        <h1 className="mt-5 font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
          Dashboard
        </h1>
        <p className="mt-3 text-sm text-muted">
          Signed in as <span className="font-mono text-ink-soft">{displayName}</span>.
        </p>
      </div>

      <Section className="p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-mono">Account</p>
            <p className="mt-2 text-lg">{displayName}</p>
            <p className="font-mono text-[11px] text-muted">{user.email}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="btn btn-outline btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </Section>

      <Section className="p-6 md:p-8">
        <div role="alert" className="alert alert-info alert-outline">
          <span>
            The console is under construction. The gateway endpoints behind these surfaces are
            already live — the UI lands next.
          </span>
        </div>

        <ul className="mt-6 grid gap-px border border-line bg-line md:grid-cols-3">
          {UPCOMING.map((item) => (
            <li key={item.title} className="bg-paper p-5">
              <p className="font-serif text-xl tracking-tight">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
