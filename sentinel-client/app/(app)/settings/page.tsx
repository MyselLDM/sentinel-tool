import type { Metadata } from "next";
import { AlertTriangle, Cpu, Layers, ShieldCheck, Info, Activity } from "lucide-react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { getModelInfo, getModelMetrics } from "@/lib/api/models";
import type { ModelConfig, ModelMetrics } from "@/lib/api/types";
import { verifySession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Model info — Sentinel",
};

export default async function SettingsPage() {
  await verifySession();

  let modelConfig: ModelConfig = {
    source: "defaults",
    stale: false,
    nli: {
      base: "cross-encoder/nli-MiniLM2-L6-H768",
      version: "sentinelagent-nli-3class-v1",
      labels: ["contradiction", "entailment", "neutral"],
      decision: "p_contradiction > threshold",
      threshold: 0.5,
      threshold_source: "placeholder",
    },
    contrastive: {
      base: "all-MiniLM-L12-v2",
      version: "contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2",
      decision: "cosine < threshold",
      threshold: 0.5,
      threshold_source: "placeholder",
    },
  };

  let modelMetrics: ModelMetrics = { metrics: [] };
  let loadError: string | null = null;

  try {
    const [info, metrics] = await Promise.all([
      getModelInfo(),
      getModelMetrics().catch(() => ({ metrics: [] })),
    ]);
    modelConfig = info;
    modelMetrics = metrics;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not fetch model metadata from gateway.";
    modelConfig.stale = true;
  }

  const isStale = modelConfig.stale;
  const nli = modelConfig.nli;
  const contrastive = modelConfig.contrastive;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div>
        <Eyebrow>Configuration</Eyebrow>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-heading md:text-3xl">
          Model info
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Active model checkpoints, trained decision thresholds, and runtime inference counters.
        </p>
      </div>

      {/* ── Stale Warning Alert ────────────────────────────────────── */}
      {isStale && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-warning-amber/20 bg-warning-bg p-4 text-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning-amber" />
          <div>
            <span className="font-medium text-heading block text-sm">
              Inference service unreachable
            </span>
            <p className="mt-1 text-sm text-muted">
              {loadError ??
                "The gateway is serving cached or fallback model specifications. Live evaluations may be using degraded or mock scores until the service reconnects."}
            </p>
          </div>
        </div>
      )}

      {/* ── Dual-Model Architecture Callout ────────────────────────── */}
      <Section className="p-6 md:p-8">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-blue">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-heading">
              OR-Gating Decision Principle
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Sentinel operates with zero tolerance for misaligned actions. A proposed subtask is{" "}
              <strong className="text-heading font-semibold">blocked if EITHER model rejects</strong>.
              Thresholds are strictly read-only in production and calibrated from F1-optimal cross-validation during training.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-page p-4">
            <span className="text-xs font-medium text-muted">Check 1: NLI Contradiction</span>
            <p className="mt-2 font-mono text-xs text-heading">
              {nli.decision ?? "p_contradiction > threshold"}
            </p>
            <p className="mt-1 text-xs text-muted">Flags direct logical opposition</p>
          </div>
          <div className="rounded-lg border border-border bg-page p-4">
            <span className="text-xs font-medium text-muted">Check 2: Contrastive Similarity</span>
            <p className="mt-2 font-mono text-xs text-heading">
              {contrastive.decision ?? "cosine < threshold"}
            </p>
            <p className="mt-1 text-xs text-muted">Flags semantic goal deviation</p>
          </div>
          <div className="rounded-lg border border-border bg-page p-4">
            <span className="text-xs font-medium text-muted">Combined Verdict</span>
            <p className="mt-2 font-mono text-xs text-heading">
              REJECT if (NLI || Contrastive)
            </p>
            <p className="mt-1 text-xs text-muted">Strict disjunction for security</p>
          </div>
        </div>
      </Section>

      {/* ── Dual Model Checkpoint Panels ───────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Model 1: NLI Cross-Encoder */}
        <Section className="flex flex-col justify-between p-6 md:p-8">
          <div>
            <div className="flex items-start justify-between gap-4 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary-blue">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <h3 className="text-lg font-semibold text-heading">NLI Cross-Encoder</h3>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Full cross-attention classifier scoring contradiction probability.
                </p>
              </div>
              <StatusBadge
                status={nli.threshold_source === "placeholder" ? "placeholder" : "active"}
                label={nli.threshold_source === "placeholder" ? "Placeholder" : "Active"}
              />
            </div>

            {/* Threshold Highlight Box */}
            <div className="mt-4 rounded-lg border border-border bg-page p-4">
              <span className="text-xs font-medium text-muted">Active Decision Threshold</span>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-mono text-2xl font-semibold text-heading">
                  {nli.threshold != null ? nli.threshold.toFixed(3) : "—"}
                </span>
                <span className="text-xs text-muted">
                  ({nli.threshold_source ?? "training calibrated"})
                </span>
              </div>
              <p className="mt-1 text-xs text-muted font-mono">
                Rule: {nli.decision ?? "p_contradiction > threshold"}
              </p>
            </div>

            {/* Spec Table */}
            <dl className="mt-6 divide-y divide-border text-sm">
              <div className="flex justify-between py-3">
                <dt className="text-muted">Model Version</dt>
                <dd className="font-mono text-xs text-heading text-right">{nli.version}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-muted">Base Architecture</dt>
                <dd className="font-mono text-xs text-heading text-right">{nli.base}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-muted">Output Classes</dt>
                <dd className="font-mono text-xs text-heading text-right">
                  {nli.labels ? nli.labels.join(" · ") : "3-class"}
                </dd>
              </div>
              {nli.activation && (
                <div className="flex justify-between py-3">
                  <dt className="text-muted">Activation Function</dt>
                  <dd className="font-mono text-xs text-heading text-right">{nli.activation}</dd>
                </div>
              )}
              {nli.resolved_source && (
                <div className="flex flex-col gap-1 py-3">
                  <dt className="text-muted">Resolved Checkpoint</dt>
                  <dd className="font-mono text-xs text-muted break-all">
                    {nli.resolved_source}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="mt-6 border-t border-border pt-4 text-xs text-muted flex items-center gap-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Trained with sentence-transformers cross-encoder pipeline.</span>
          </div>
        </Section>

        {/* Model 2: Contrastive Bi-Encoder */}
        <Section className="flex flex-col justify-between p-6 md:p-8">
          <div>
            <div className="flex items-start justify-between gap-4 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary-blue">
                    <Layers className="h-4 w-4" />
                  </div>
                  <h3 className="text-lg font-semibold text-heading">Contrastive Bi-Encoder</h3>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Dual-tower embedding model measuring cosine similarity.
                </p>
              </div>
              <StatusBadge
                status={contrastive.threshold_source === "placeholder" ? "placeholder" : "active"}
                label={contrastive.threshold_source === "placeholder" ? "Placeholder" : "Active"}
              />
            </div>

            {/* Threshold Highlight Box */}
            <div className="mt-4 rounded-lg border border-border bg-page p-4">
              <span className="text-xs font-medium text-muted">Active Decision Threshold</span>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-mono text-2xl font-semibold text-heading">
                  {contrastive.threshold != null ? contrastive.threshold.toFixed(3) : "—"}
                </span>
                <span className="text-xs text-muted">
                  ({contrastive.threshold_source ?? "training calibrated"})
                </span>
              </div>
              <p className="mt-1 text-xs text-muted font-mono">
                Rule: {contrastive.decision ?? "cosine < threshold"}
              </p>
            </div>

            {/* Spec Table */}
            <dl className="mt-6 divide-y divide-border text-sm">
              <div className="flex justify-between py-3">
                <dt className="text-muted">Model Version</dt>
                <dd className="font-mono text-xs text-heading text-right">{contrastive.version}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-muted">Base Architecture</dt>
                <dd className="font-mono text-xs text-heading text-right">{contrastive.base}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-muted">Task Decomposition</dt>
                <dd className="font-mono text-xs text-heading text-right">
                  {contrastive.include_decomposed ? "Enabled" : "Disabled"}
                </dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-muted">Distance Metric</dt>
                <dd className="font-mono text-xs text-heading text-right">Cosine Similarity</dd>
              </div>
              {contrastive.resolved_source && (
                <div className="flex flex-col gap-1 py-3">
                  <dt className="text-muted">Resolved Checkpoint</dt>
                  <dd className="font-mono text-xs text-muted break-all">
                    {contrastive.resolved_source}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="mt-6 border-t border-border pt-4 text-xs text-muted flex items-center gap-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Trained with sentence-transformers MultipleNegativesRankingLoss.</span>
          </div>
        </Section>
      </div>

      {/* ── Runtime Inference Metrics ──────────────────────────────── */}
      <Section className="p-6 md:p-8">
        <div className="flex items-center justify-between pb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary-blue">
              <Activity className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-heading">Runtime Model Counters</h2>
          </div>
          <span className="rounded-md bg-page px-2.5 py-1 font-mono text-xs text-muted">GET /api/metrics</span>
        </div>

        {modelMetrics.metrics.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            No runtime inference executions have been recorded in this gateway session yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted">
                  <th className="py-3 pr-4">Model Type</th>
                  <th className="py-3 px-4 text-right">Evaluations</th>
                  <th className="py-3 px-4 text-right">Rejections</th>
                  <th className="py-3 px-4 text-right">Avg Score</th>
                  <th className="py-3 px-4 text-right">Avg Latency</th>
                  <th className="py-3 pl-4 text-right">Last Evaluated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {modelMetrics.metrics.map((m) => (
                  <tr key={m.modelType} className="hover:bg-page/60 transition-colors">
                    <td className="py-3.5 pr-4 font-medium text-heading capitalize">
                      {m.modelType}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-heading">
                      {m.evaluationCount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-heading">
                      {m.rejectionCount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-muted">
                      {m.avgScore != null ? m.avgScore.toFixed(3) : "—"}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-muted">
                      {m.avgResponseTimeMs != null ? `${Math.round(m.avgResponseTimeMs)} ms` : "—"}
                    </td>
                    <td className="py-3.5 pl-4 text-right text-xs text-muted">
                      {m.lastUpdated ? new Date(m.lastUpdated).toLocaleTimeString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
