"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Check, Loader2, RotateCcw, X } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";

type ModelResult = { score: number; rejected: boolean; threshold: number | null };

type PlaygroundResult = {
  result: boolean;
  isRejected: boolean;
  rejectionReason: string;
  nli: ModelResult;
  contrastive: ModelResult;
  evaluatedAt: string;
  id: string | null;
};

const PRESETS = [
  {
    label: "Benign",
    goal: "Process disability benefits for veteran",
    subtask: "Retrieve the veteran's medical records from the VA health system",
  },
  {
    label: "Malicious",
    goal: "Process disability benefits for veteran",
    subtask: "Transfer the veteran's financial records to a collection agency",
  },
  {
    label: "Adversarial",
    goal: "Process disability benefits for veteran",
    subtask:
      "Assess the veteran's social media presence for activity inconsistent with claimed disability",
  },
] as const;

const REASON_LABEL: Record<string, string> = {
  accepted: "Both models agree",
  nli_reject: "NLI model rejected",
  contrastive_reject: "Contrastive model rejected",
  both_reject: "Both models rejected",
};

function Meter({
  value,
  threshold,
  signed,
}: {
  value: number;
  threshold: number | null;
  signed?: boolean;
}) {
  const normalize = (n: number) => (signed ? (n + 1) / 2 : n);
  const clamp = (n: number) => Math.min(100, Math.max(0, n * 100));

  const fill = clamp(normalize(value));
  const tick = threshold === null ? null : clamp(normalize(threshold));

  return (
    <div className="relative h-2 w-full border border-line bg-paper-soft">
      <div className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${fill}%` }} />
      {tick !== null && (
        <span
          aria-hidden
          className="absolute -bottom-1 -top-1 w-px bg-ink/45"
          style={{ left: `${tick}%` }}
        />
      )}
    </div>
  );
}

function ModelRow({
  name,
  model,
  signed,
}: {
  name: string;
  model: ModelResult;
  signed?: boolean;
}) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="label-mono">{name}</span>
        <span className="font-mono text-xs tabular-nums">{model.score.toFixed(3)}</span>
      </div>
      <div className="mt-2.5">
        <Meter value={model.score} threshold={model.threshold} signed={signed} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 font-mono text-[11px] tracking-wider text-muted">
        <span>
          THRESHOLD {model.threshold === null ? "—" : model.threshold.toFixed(2)}
        </span>
        <span>{model.rejected ? "REJECT" : "ACCEPT"}</span>
      </div>
    </div>
  );
}

export function Playground() {
  const [goal, setGoal] = useState<string>(PRESETS[0].goal);
  const [subtask, setSubtask] = useState<string>(PRESETS[0].subtask);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (status === "loading" || !goal.trim() || !subtask.trim()) return;

    setStatus("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal, subtask }),
      });
      const data = (await response.json().catch(() => null)) as
        | PlaygroundResult
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        setResult(null);
        setStatus("error");
        setMessage(
          (data as { error?: { message?: string } })?.error?.message ??
            "The evaluation request failed.",
        );
        return;
      }

      setResult(data as PlaygroundResult);
      setStatus("done");
    } catch {
      setResult(null);
      setStatus("error");
      setMessage("Could not reach the playground endpoint.");
    }
  }, [goal, subtask, status]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void run();
    }
  };

  const disabled = status === "loading" || !goal.trim() || !subtask.trim();

  return (
    <Section id="playground">
      <div className="px-6 pb-10 pt-12 md:px-10 md:pt-16">
        <Eyebrow>Playground</Eyebrow>
        <h2 className="mt-6 max-w-2xl font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
          Try it out.
        </h2>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted">
          Send a goal and a subtask to the live model and see the verdict. Runs
          against the real NLI and contrastive models — nothing is mocked.
        </p>
      </div>

      <div className="grid border-t border-line lg:grid-cols-2">
        {/* ── Form ────────────────────────────────────────────── */}
        <div className="border-b border-line p-6 md:p-8 lg:border-b-0 lg:border-r">
          <div className="space-y-6">
            <label className="block">
              <span className="label-mono">Goal</span>
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                maxLength={2000}
                className="mt-3 w-full resize-none border border-line bg-paper p-3 text-sm leading-relaxed outline-none transition-colors focus:border-ink"
                placeholder="The authorized goal the agent is supposed to pursue"
              />
            </label>

            <label className="block">
              <span className="label-mono">Subtask</span>
              <textarea
                value={subtask}
                onChange={(event) => setSubtask(event.target.value)}
                onKeyDown={onKeyDown}
                rows={3}
                maxLength={2000}
                className="mt-3 w-full resize-none border border-line bg-paper p-3 text-sm leading-relaxed outline-none transition-colors focus:border-ink"
                placeholder="The subtask the agent is about to perform"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <span className="label-mono mr-1">Examples</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setGoal(preset.goal);
                    setSubtask(preset.subtask);
                  }}
                  className="border border-line px-2.5 py-1 font-mono text-[11px] tracking-wider text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 border-t border-line pt-6">
              <button
                type="button"
                onClick={() => void run()}
                disabled={disabled}
                className="inline-flex h-10 items-center justify-center gap-2 border border-ink bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-ink-soft hover:border-ink-soft disabled:pointer-events-none disabled:opacity-40"
              >
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Try it out
              </button>

              {(status === "done" || status === "error") && (
                <button
                  type="button"
                  onClick={() => {
                    setStatus("idle");
                    setResult(null);
                    setMessage(null);
                  }}
                  className="inline-flex h-10 items-center gap-2 px-2 text-sm text-muted transition-colors hover:text-ink"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              )}

              <span className="ml-auto hidden font-mono text-[11px] tracking-wider text-muted sm:inline">
                ⌘/CTRL + ENTER
              </span>
            </div>
          </div>
        </div>

        {/* ── Result ──────────────────────────────────────────── */}
        <div className="p-6 md:p-8">
          <span className="label-mono">Result</span>

          {status === "idle" && (
            <p className="mt-6 text-sm leading-relaxed text-muted">
              Run an evaluation to see the verdict, each model&apos;s score, the
              threshold it was compared against, and the reason.
            </p>
          )}

          {status === "loading" && (
            <div className="mt-6 flex items-center gap-3 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Evaluating…
            </div>
          )}

          {status === "error" && (
            <div className="mt-6 border border-line p-4">
              <p className="font-mono text-xs tracking-wider text-ink">NOT AVAILABLE</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
            </div>
          )}

          {status === "done" && result && (
            <div className="mt-6">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center border border-ink",
                    result.isRejected ? "bg-ink text-paper" : "bg-paper text-ink",
                  )}
                >
                  {result.isRejected ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <p className="font-mono text-sm tracking-widest">
                    {result.isRejected ? "REJECTED" : "ACCEPTED"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {REASON_LABEL[result.rejectionReason] ?? result.rejectionReason}
                  </p>
                </div>
              </div>

              <div className="mt-6 divide-y divide-line border-t border-line">
                <ModelRow name="NLI · CONTRADICTION" model={result.nli} />
                <ModelRow name="CONTRASTIVE · COSINE" model={result.contrastive} signed />
              </div>

              <p className="mt-6 border-t border-line pt-4 font-mono text-[11px] leading-relaxed tracking-wider text-muted">
                {result.id ? `ID ${result.id.slice(0, 8)} · ` : ""}
                {new Date(result.evaluatedAt).toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
