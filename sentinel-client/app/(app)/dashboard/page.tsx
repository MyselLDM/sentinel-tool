import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { verifySession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Dashboard — Sentinel",
};

const QUICK_LINKS = [
  { href: "/api-keys", title: "API keys", body: "Issue, rate-limit and revoke keys." },
  { href: "/logs", title: "Logs", body: "Every evaluation, filterable and CSV-exportable." },
  { href: "/settings", title: "Model info", body: "Which models are live and how they decide." },
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
        <div role="alert" className="alert alert-info alert-outline">
          <span>
            The console is under construction. The gateway endpoints behind these surfaces are
            already live — the UI lands next.
          </span>
        </div>

        <ul className="mt-6 grid gap-px border border-line bg-line md:grid-cols-3">
          {QUICK_LINKS.map((item) => (
            <li key={item.href} className="bg-paper">
              <Link
                href={item.href}
                className="group flex h-full flex-col p-5 transition-colors hover:bg-paper-soft"
              >
                <span className="flex items-center gap-2 font-serif text-xl tracking-tight">
                  {item.title}
                  <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-2 text-sm leading-relaxed text-muted">{item.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
