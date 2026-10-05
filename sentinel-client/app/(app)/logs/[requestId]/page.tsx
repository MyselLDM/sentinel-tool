import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/ui/eyebrow";
import { getRequest } from "@/lib/api/requests";
import type { NliDetail, ModelDetail, RequestDetail } from "@/lib/api/requests";
import { readSession } from "@/lib/auth/session";
import { cn } from "@/lib/cn";

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ requestId: string }>;
}): Promise<Metadata> {
  const { requestId } = await params;
  return {
    title: `Request ${requestId.slice(0, 8)} — Sentinel`,
    description: "Full evaluation detail including NLI and contrastive model scores.",
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ── Score Meter ───────────────────────────────────────────────────────────────

/**
 * Renders a horizontal progress bar with the score and a threshold tick-mark.
 * `signed` normalises the [-1, 1] cosine range to [0, 1] for display.
 */
function ScoreMeter({
  score,
  threshold,
  rejected,
  signed = false,
}: {
  score: number;
  threshold: number;
  rejected: boolean;
  signed?: boolean;
}) {
  const normalize = (n: number) => (signed ? (n + 1) / 2 : n);
  const clamp = (n: number) => Math.min(100, Math.max(0, n * 100));

  const fill = clamp(normalize(score));
  const tick = clamp(normalize(threshold));

  return (
    <div className="relative h-2.5 w-full rounded-full bg-page" role="img" aria-label={`Score ${score.toFixed(3)}, threshold ${threshold.toFixed(3)}`}>
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-all",
          rejected ? "bg-error-red" : "bg-success-green",
        )}
        style={{ width: `${fill}%` }}
      />
      <span
        aria-hidden
        className="absolute -bottom-0.5 -top-0.5 w-0.5 rounded-full bg-heading/40"
        style={{ left: `${tick}%` }}
      />
    </div>
  );
}

// ── Model Card ────────────────────────────────────────────────────────────────

function ModelCard({
  name,
  rule,
  model,
  signed = false,
  children,
}: {
  name: string;
  rule: string;
  model: ModelDetail;
  signed?: boolean;
  children?: React.ReactNode;
}) {
  const rejected = model.result; // nli/contrastive result = true means rejected (stored model reject)

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-heading">{name}</p>
          <p className="mt-1 text-xs text-muted">{rule}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            rejected
              ? "bg-error-bg text-error-red"
              : "bg-success-bg text-success-green",
          )}
        >
          {rejected ? "Rejected" : "Accepted"}
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Score</span>
          <span className="font-mono text-sm font-semibold text-heading">{model.score.toFixed(4)}</span>
        </div>
        <ScoreMeter score={model.score} threshold={model.threshold} rejected={rejected} signed={signed} />
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>0{signed ? " (−1)" : ""}</span>
          <span className="font-medium">Threshold: {model.threshold.toFixed(3)}</span>
          <span>1{signed ? " (+1)" : ""}</span>
        </div>
      </div>

      {children}
    </div>
  );
}

// ── Raw NLI Scores ────────────────────────────────────────────────────────────

function RawScoresCard({ rawScores }: { rawScores: NliDetail["rawScores"] }) {
  const labels: Array<{ key: keyof typeof rawScores; label: string }> = [
    { key: "contradiction", label: "Contradiction" },
    { key: "entailment", label: "Entailment" },
    { key: "neutral", label: "Neutral" },
  ];

  return (
    <div className="mt-5 border-t border-border pt-4 space-y-3">
      <p className="text-xs font-medium text-muted">Raw NLI probabilities</p>
      {labels.map(({ key, label }) => {
        const val = rawScores[key];
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted">{label}</span>
              <span className="font-mono text-xs font-medium text-heading">{pct(val)}</span>
            </div>
            <div className="relative h-1.5 w-full rounded-full bg-page">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  key === "contradiction" ? "bg-error-red" : "bg-border-strong",
                )}
                style={{ width: pct(val) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Verdict Banner ────────────────────────────────────────────────────────────

const REASON_LABEL: Record<string, string> = {
  accepted: "Both models agree — subtask is aligned with the goal.",
  nli_reject: "NLI model detected contradiction with the goal.",
  contrastive_reject: "Contrastive model found insufficient semantic similarity.",
  both_reject: "Both models rejected — NLI contradiction and low cosine similarity.",
};

function VerdictBanner({
  isRejected,
  rejectionReason,
}: {
  isRejected: boolean;
  rejectionReason: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl p-5",
        isRejected
          ? "border border-error-red/20 bg-error-bg"
          : "border border-success-green/20 bg-success-bg",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          isRejected ? "bg-error-red/10 text-error-red" : "bg-success-green/10 text-success-green",
        )}
        aria-hidden
      >
        {isRejected ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
      </div>
      <div className="min-w-0">
        <p className={cn(
          "text-base font-semibold",
          isRejected ? "text-error-red" : "text-success-green",
        )}>
          Subtask {isRejected ? "rejected" : "accepted"}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-body">
          {REASON_LABEL[rejectionReason] ?? rejectionReason}
        </p>
      </div>
    </div>
  );
}

// ── Metadata row ──────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-3 border-b border-border py-3 last:border-0">
      <span className="w-36 shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 text-sm font-medium text-heading">{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;

  const session = await readSession();
  if (!session) notFound();

  let detail: RequestDetail;
  try {
    detail = await getRequest(session.accessToken, requestId);
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 404) notFound();
    // Other errors — show a minimal error state
    throw err;
  }

  const {
    goal,
    subtask,
    isRejected,
    rejectionReason,
    nli,
    contrastive,
    responseTimeMs,
    modelVersion,
    evaluationMode,
    userAgent,
    createdAt,
    apiKeyId,
  } = detail;

  return (
    <div className="space-y-8">
      {/* Back + header */}
      <div>
        <Link
          href="/logs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-blue transition-colors hover:text-primary-hover"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to logs
        </Link>

        <div className="mt-5">
          <Eyebrow>Evaluation Detail</Eyebrow>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-heading md:text-3xl">
            Request Inspector
          </h1>
          <p className="mt-2 font-mono text-xs text-muted" title={detail.requestId}>
            ID: {detail.requestId}
          </p>
        </div>
      </div>

      {/* Combined verdict */}
      <VerdictBanner isRejected={isRejected} rejectionReason={rejectionReason} />

      {/* Goal + Subtask */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-medium text-muted mb-3">Goal</p>
          <p className="text-sm leading-relaxed text-heading">{goal}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-medium text-muted mb-3">Subtask</p>
          <p className="text-sm leading-relaxed text-heading">{subtask}</p>
        </div>
      </div>

      {/* Model scores */}
      <div>
        <p className="text-sm font-medium text-muted mb-4">Model scores</p>
        <div className="grid gap-4 md:grid-cols-2">
          {/* NLI */}
          <ModelCard
            name="NLI · Cross-Encoder"
            rule="Reject when p(contradiction) > threshold"
            model={nli}
          >
            <RawScoresCard rawScores={nli.rawScores} />
          </ModelCard>

          {/* Contrastive */}
          <ModelCard
            name="Contrastive · Bi-Encoder"
            rule="Reject when cosine similarity < threshold"
            model={contrastive}
            signed
          />
        </div>
      </div>

      {/* Request metadata */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary-blue">
            <Info className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold text-heading">Request metadata</p>
        </div>

        <div>
          <MetaRow label="Request ID" value={<span className="font-mono text-xs">{detail.requestId}</span>} />
          <MetaRow
            label="API Key"
            value={
              <span className="font-mono text-xs" title={apiKeyId}>
                {apiKeyId.slice(0, 8)}… <span className="text-muted font-normal">(masked)</span>
              </span>
            }
          />
          <MetaRow label="Model version" value={<span className="font-mono text-xs">{modelVersion}</span>} />
          <MetaRow
            label="Mode"
            value={<span className="rounded-md bg-page px-2 py-0.5 text-xs font-medium capitalize">{evaluationMode}</span>}
          />
          <MetaRow
            label="Latency"
            value={
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted" />
                <span className="font-mono text-xs">{responseTimeMs.toLocaleString()} ms</span>
              </span>
            }
          />
          <MetaRow label="Created at" value={fmtDateTime(createdAt)} />
          {userAgent && <MetaRow label="User agent" value={<span className="text-xs">{userAgent}</span>} />}
        </div>
      </div>
    </div>
  );
}
