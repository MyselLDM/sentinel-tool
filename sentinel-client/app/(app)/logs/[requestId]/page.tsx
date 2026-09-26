import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, Info } from "lucide-react";
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
 * Renders a horizontal bar with the score and a threshold tick-mark.
 * `signed` normalises the [-1, 1] cosine range to [0, 1] for display.
 */
function ScoreMeter({
  score,
  threshold,
  signed = false,
}: {
  score: number;
  threshold: number;
  signed?: boolean;
}) {
  const normalize = (n: number) => (signed ? (n + 1) / 2 : n);
  const clamp = (n: number) => Math.min(100, Math.max(0, n * 100));

  const fill = clamp(normalize(score));
  const tick = clamp(normalize(threshold));

  return (
    <div className="relative h-2 w-full border border-line bg-paper-soft" role="img" aria-label={`Score ${score.toFixed(3)}, threshold ${threshold.toFixed(3)}`}>
      <div className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${fill}%` }} />
      <span
        aria-hidden
        className="absolute -bottom-1 -top-1 w-px bg-ink/40"
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
    <div className="border border-line bg-paper p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-mono">{name}</p>
          <p className="mt-1 font-mono text-[11px] tracking-wider text-muted">{rule}</p>
        </div>
        <span
          className={cn(
            "shrink-0 font-mono text-xs tracking-wider",
            rejected ? "text-ink" : "text-muted",
          )}
        >
          {rejected ? "REJECTED" : "ACCEPTED"}
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-xs text-muted">Score</span>
          <span className="font-mono text-sm">{model.score.toFixed(4)}</span>
        </div>
        <ScoreMeter score={model.score} threshold={model.threshold} signed={signed} />
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] tracking-wider text-muted">
          <span>0{signed ? " (−1)" : ""}</span>
          <span>THRESHOLD {model.threshold.toFixed(3)}</span>
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
    <div className="mt-4 border-t border-line pt-4 space-y-2">
      <p className="label-mono mb-3">Raw NLI probabilities</p>
      {labels.map(({ key, label }) => {
        const val = rawScores[key];
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-muted uppercase tracking-wider">{label}</span>
              <span className="font-mono text-xs">{pct(val)}</span>
            </div>
            <div className="relative h-1.5 w-full border border-line bg-paper-soft">
              <div
                className={cn("absolute inset-y-0 left-0", key === "contradiction" ? "bg-ink" : "bg-line-strong")}
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
        "flex items-start gap-4 border p-5",
        isRejected ? "border-ink bg-ink text-paper" : "border-line bg-paper",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center border font-mono text-lg",
          isRejected ? "border-paper/40" : "border-ink",
        )}
        aria-hidden
      >
        {isRejected ? "✕" : "✓"}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-sm font-medium tracking-widest">
          {isRejected ? "REJECTED" : "ACCEPTED"}
        </p>
        <p
          className={cn(
            "mt-1 text-sm leading-relaxed",
            isRejected ? "text-paper/80" : "text-muted",
          )}
        >
          {REASON_LABEL[rejectionReason] ?? rejectionReason}
        </p>
      </div>
    </div>
  );
}

// ── Metadata row ──────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-3 border-b border-line py-2.5 last:border-0">
      <span className="label-mono w-36 shrink-0">{label}</span>
      <span className="min-w-0 font-mono text-xs leading-relaxed">{value}</span>
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
          className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" />
          BACK TO LOGS
        </Link>

        <div className="mt-5">
          <Eyebrow>Evaluation Detail</Eyebrow>
          <h1 className="mt-3 font-serif text-3xl leading-tight tracking-[-0.01em] md:text-4xl">
            Request Inspector
          </h1>
          <p className="mt-2 font-mono text-xs text-muted" title={detail.requestId}>
            ID: {detail.requestId}
          </p>
        </div>
      </div>

      {/* Combined verdict */}
      <div>
        <p className="label-mono mb-3">Overall verdict</p>
        <VerdictBanner isRejected={isRejected} rejectionReason={rejectionReason} />
      </div>

      {/* Goal + Subtask */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-line bg-paper p-5">
          <p className="label-mono mb-3">Goal</p>
          <p className="text-sm leading-relaxed">{goal}</p>
        </div>
        <div className="border border-line bg-paper p-5">
          <p className="label-mono mb-3">Subtask</p>
          <p className="text-sm leading-relaxed">{subtask}</p>
        </div>
      </div>

      {/* Model scores */}
      <div>
        <p className="label-mono mb-3">Model scores</p>
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
      <div className="border border-line bg-paper p-5">
        <div className="mb-4 flex items-center gap-2">
          <Info className="h-4 w-4 text-muted" />
          <p className="label-mono">Request metadata</p>
        </div>

        <div>
          <MetaRow label="Request ID" value={detail.requestId} />
          <MetaRow
            label="API Key"
            value={
              <span title={apiKeyId}>
                {apiKeyId.slice(0, 8)}… <span className="text-muted">(masked)</span>
              </span>
            }
          />
          <MetaRow label="Model version" value={modelVersion} />
          <MetaRow
            label="Mode"
            value={<span className="uppercase">{evaluationMode}</span>}
          />
          <MetaRow
            label="Latency"
            value={
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted" />
                {responseTimeMs.toLocaleString()} ms
              </span>
            }
          />
          <MetaRow label="Created at" value={fmtDateTime(createdAt)} />
          {userAgent && <MetaRow label="User agent" value={userAgent} />}
        </div>
      </div>
    </div>
  );
}
