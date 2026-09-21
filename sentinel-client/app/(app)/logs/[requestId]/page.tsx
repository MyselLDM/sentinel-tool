import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock3, Download, Gauge, ShieldAlert, UserRound } from "lucide-react";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/dal";
import { readSession } from "@/lib/auth/session";
import { getRequest } from "@/lib/api/requests";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Evaluation details — Sentinel",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function scorePercent(score: number | null | undefined): string {
  if (typeof score !== "number") return "—";
  return `${Math.round(score * 100)}%`;
}

function badgeClass(status: boolean | null): string {
  if (status === true) return "badge badge-error";
  if (status === false) return "badge badge-success";
  return "badge badge-neutral";
}

export default async function RequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const session = await readSession();
  if (!session) notFound();

  let request;
  try {
    request = await getRequest(session.accessToken, requestId);
  } catch {
    notFound();
  }

  const rawScores = request.nli.rawScores ?? {};

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow>Evaluation</Eyebrow>
          <h1 className="mt-5 font-serif text-4xl tracking-[-0.01em] md:text-5xl">
            Request {request.requestId}
          </h1>
        </div>
        <Link href="/logs" className="btn btn-ghost btn-sm gap-2 self-start">
          <ArrowLeft className="h-4 w-4" />
          Back to logs
        </Link>
      </div>

      <Section className="p-6 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div>
              <div className="label-mono text-xs uppercase tracking-[0.18em] text-muted">Goal</div>
              <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{request.goal}</p>
            </div>

            <div>
              <div className="label-mono text-xs uppercase tracking-[0.18em] text-muted">Subtask</div>
              <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{request.subtask}</p>
            </div>
          </div>

          <div className="space-y-4 rounded-none border border-line bg-paper-soft p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="label-mono text-xs uppercase tracking-[0.18em] text-muted">Decision</span>
              <span className={badgeClass(request.isRejected)}>{request.isRejected ? "Rejected" : "Accepted"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <ShieldAlert className="h-4 w-4" />
              <span>{request.rejectionReason ?? "accepted"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <Clock3 className="h-4 w-4" />
              <span>{request.responseTimeMs ?? 0} ms</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <Download className="h-4 w-4" />
              <span>{request.evaluationMode ?? "standard"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <UserRound className="h-4 w-4" />
              <span>{request.userAgent ?? "unknown user-agent"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <Gauge className="h-4 w-4" />
              <span>{request.modelVersion ?? "unknown model"}</span>
            </div>
          </div>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section className="p-6 md:p-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-serif text-2xl tracking-tight">NLI model</h2>
            <span className={badgeClass(request.nli.result)}>{request.nli.result === true ? "Reject" : request.nli.result === false ? "Accept" : "Unknown"}</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted">Score</span>
              <span className="font-mono">{scorePercent(request.nli.score)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Threshold</span>
              <span className="font-mono">{scorePercent(request.nli.threshold)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Decision</span>
              <span className="font-mono">{request.nli.result === true ? "reject" : "accept"}</span>
            </div>
          </div>

          <div className="mt-6 overflow-hidden border border-line">
            <div className="grid grid-cols-[1fr_auto] border-b border-line bg-paper-soft px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted">
              <span>Label</span>
              <span>Probability</span>
            </div>
            {Object.entries(rawScores).length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted">No raw scores recorded.</div>
            ) : (
              Object.entries(rawScores).map(([label, value]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] border-b border-line px-3 py-2 last:border-b-0">
                  <span className="capitalize">{label}</span>
                  <span className="font-mono">{Number(value).toFixed(4)}</span>
                </div>
              ))
            )}
          </div>
        </Section>

        <Section className="p-6 md:p-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-serif text-2xl tracking-tight">Contrastive model</h2>
            <span className={badgeClass(request.contrastive.result)}>{request.contrastive.result === true ? "Reject" : request.contrastive.result === false ? "Accept" : "Unknown"}</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted">Score</span>
              <span className="font-mono">{request.contrastive.score ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Threshold</span>
              <span className="font-mono">{request.contrastive.threshold ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Decision</span>
              <span className="font-mono">{request.contrastive.result === true ? "reject" : "accept"}</span>
            </div>
          </div>

          <div className="mt-6 rounded-none border border-line bg-paper-soft p-4 text-sm text-muted">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Dual-model decision logic: reject if either model rejects.</span>
            </div>
          </div>
        </Section>
      </div>

      <Section className="p-6 md:p-8">
        <h2 className="font-serif text-2xl tracking-tight">Metadata</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="label-mono text-xs uppercase tracking-[0.18em] text-muted">Created</dt>
            <dd className="mt-2 font-mono text-sm">{formatDate(request.createdAt)}</dd>
          </div>
          <div>
            <dt className="label-mono text-xs uppercase tracking-[0.18em] text-muted">API key</dt>
            <dd className="mt-2 font-mono text-sm">{request.apiKeyId ?? "—"}</dd>
          </div>
          <div>
            <dt className="label-mono text-xs uppercase tracking-[0.18em] text-muted">Mode</dt>
            <dd className="mt-2 font-mono text-sm">{request.evaluationMode ?? "standard"}</dd>
          </div>
          <div>
            <dt className="label-mono text-xs uppercase tracking-[0.18em] text-muted">Response time</dt>
            <dd className="mt-2 font-mono text-sm">{request.responseTimeMs ?? 0} ms</dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}
