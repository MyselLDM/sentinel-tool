import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ShieldCheck, Clock, KeyRound, Activity, AlertCircle, Play } from "lucide-react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getStatsSummary, getRecentRequests } from "@/lib/api/stats";
import type { StatPeriod } from "@/lib/api/types";
import { verifySession } from "@/lib/auth/dal";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Dashboard — Sentinel",
};

const VALID_PERIODS: readonly StatPeriod[] = ["24h", "7d", "30d"] as const;

const REASON_LABELS: Record<string, string> = {
  accepted: "Both models agree",
  nli_reject: "NLI contradiction",
  contrastive_reject: "Low similarity",
  both_reject: "Both models reject",
};

const QUICK_LINKS = [
  { href: "/api-keys", title: "API keys", body: "Issue, rate-limit and revoke keys." },
  { href: "/logs", title: "Logs", body: "Every evaluation, filterable and CSV-exportable." },
  { href: "/settings", title: "Model info", body: "Which models are live and how they decide." },
];

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

type PageProps = {
  searchParams: Promise<{ period?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await verifySession();
  const displayName = user.fullName ?? user.email;

  const resolvedParams = await searchParams;
  const rawPeriod = resolvedParams.period;
  const period: StatPeriod = VALID_PERIODS.includes(rawPeriod as StatPeriod)
    ? (rawPeriod as StatPeriod)
    : "24h";

  let summary = {
    totalRequests: 0,
    rejectionRate: 0,
    avgResponseTimeMs: 0,
    activeKeys: 0,
    period,
  };
  let recentRequests: Awaited<ReturnType<typeof getRecentRequests>>["requests"] = [];
  let upstreamError: string | null = null;

  try {
    const [summaryData, recentData] = await Promise.all([
      getStatsSummary(period),
      getRecentRequests(10),
    ]);
    summary = summaryData;
    recentRequests = recentData.requests;
  } catch (err) {
    upstreamError = err instanceof Error ? err.message : "Failed to load dashboard metrics from gateway.";
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Eyebrow>Console</Eyebrow>
          <h1 className="mt-5 font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
            Dashboard
          </h1>
          <p className="mt-3 text-sm text-muted">
            Signed in as <span className="font-mono text-ink-soft">{displayName}</span>.
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1 border border-line bg-paper p-1 self-start md:self-auto">
          <span className="label-mono px-2 hidden sm:inline">Window:</span>
          {VALID_PERIODS.map((p) => {
            const isActive = period === p;
            return (
              <Link
                key={p}
                href={`/dashboard?period=${p}`}
                className={cn(
                  "px-3 py-1 font-mono text-xs tracking-wider transition-colors",
                  isActive
                    ? "bg-ink text-paper"
                    : "text-muted hover:bg-paper-soft hover:text-ink",
                )}
              >
                {p}
              </Link>
            );
          })}
        </div>
      </div>

      {upstreamError && (
        <div role="alert" className="flex items-center gap-3 border border-line-strong bg-paper p-4 text-sm text-ink">
          <AlertCircle className="h-4 w-4 shrink-0 text-muted" />
          <span>{upstreamError}</span>
        </div>
      )}

      {/* ── Metric Stat Cards Grid ─────────────────────────────────── */}
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Requests"
          value={summary.totalRequests.toLocaleString()}
          description={`Evaluations in the last ${period}`}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          title="Rejection Rate"
          value={`${(summary.rejectionRate * 100).toFixed(1)}%`}
          description="Blocked by dual-model guardrail"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <StatCard
          title="Avg Latency"
          value={`${summary.avgResponseTimeMs} ms`}
          description="End-to-end gateway evaluation time"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          title="Active API Keys"
          value={summary.activeKeys}
          description="Authorized agent credentials"
          badge={
            <Link
              href="/api-keys"
              className="font-mono text-[11px] text-muted hover:text-ink hover:underline flex items-center gap-0.5"
            >
              manage <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
          icon={<KeyRound className="h-4 w-4" />}
        />
      </div>

      {/* ── Recent Activity Section ────────────────────────────────── */}
      <Section className="p-6 md:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-5">
          <div>
            <h2 className="font-serif text-2xl tracking-tight text-ink">Recent Activity</h2>
            <p className="mt-1 text-xs text-muted">
              The latest 10 evaluation requests processed by the safety gateway.
            </p>
          </div>
          <Link
            href="/logs"
            className="group inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-muted transition-colors hover:text-ink self-start sm:self-auto"
          >
            VIEW ALL LOGS
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {recentRequests.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center border border-line bg-paper-soft text-muted">
              <Activity className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-serif text-xl tracking-tight">No evaluations recorded yet</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              Run a test query in the interactive playground or submit an evaluation request with your API key to see activity here.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/#playground"
                className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
              >
                <Play className="h-3.5 w-3.5" />
                Open Playground
              </Link>
              <Link
                href="/api-keys"
                className="inline-flex items-center gap-2 border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Manage API Keys
              </Link>
            </div>
          </div>
        ) : (
          /* Activity Table */
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] font-mono uppercase tracking-wider text-muted">
                  <th className="py-3 pr-4">Timestamp</th>
                  <th className="py-3 px-4">Request ID</th>
                  <th className="py-3 px-4">Subtask / Goal</th>
                  <th className="py-3 px-4">Latency</th>
                  <th className="py-3 pl-4 text-right">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {recentRequests.map((req) => {
                  const statusKey = req.isRejected ? "rejected" : "accepted";
                  const reasonText = REASON_LABELS[req.rejectionReason] ?? req.rejectionReason;

                  return (
                    <tr key={req.id} className="group hover:bg-paper-soft/60 transition-colors">
                      <td className="py-3.5 pr-4 whitespace-nowrap font-mono text-xs text-muted">
                        {formatTimestamp(req.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                        <Link
                          href={`/logs/${req.requestId}`}
                          className="hover:text-ink hover:underline text-ink-soft"
                          title="View evaluation detail"
                        >
                          {req.requestId.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 min-w-[280px]">
                        <div className="font-medium text-ink leading-snug line-clamp-1">
                          {req.subtask}
                        </div>
                        <div className="mt-0.5 text-xs text-muted line-clamp-1" title={req.goal}>
                          Goal: {req.goal}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs text-muted">
                        {req.responseTimeMs != null ? `${req.responseTimeMs} ms` : "—"}
                      </td>
                      <td className="py-3.5 pl-4 whitespace-nowrap text-right">
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={statusKey} />
                          {req.rejectionReason && (
                            <span className="font-mono text-[10px] text-muted tracking-wider">
                              {reasonText}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Quick Navigation Links ─────────────────────────────────── */}
      <Section className="p-6 md:p-8">
        <h3 className="label-mono">Quick Links</h3>
        <ul className="mt-4 grid gap-px border border-line bg-line md:grid-cols-3">
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
