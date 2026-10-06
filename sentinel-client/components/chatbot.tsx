"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Loader2,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldX,
  Target,
  Zap,
} from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import { SentinelLogoIcon, SentinelThinkingIcon } from "@/components/sentinel-logo";

/* ── Types ────────────────────────────────────────────────────────── */

type ModelResult = { score: number; rejected: boolean; threshold: number | null };

type EvalResult = {
  result: boolean;
  isRejected: boolean;
  rejectionReason: string;
  nli: ModelResult;
  contrastive: ModelResult;
  evaluatedAt: string;
  id: string | null;
  isMock?: boolean;
};

type TaskExecution = {
  steps: string[];
  output: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  goals?: string[];
  selectedGoal?: string;
  evaluation?: EvalResult;
  taskExecution?: TaskExecution;
  evaluating?: boolean;
  executing?: boolean;
};

/* ── Constants ────────────────────────────────────────────────────── */

const REASON_LABEL: Record<string, string> = {
  accepted: "Both models agree — subtask aligns with goal",
  nli_reject: "NLI model detected contradiction with authorized goal",
  contrastive_reject: "Contrastive model found low semantic similarity to goal",
  both_reject: "Both models independently rejected this subtask",
};

const REJECTION_EXPLANATION: Record<string, string> = {
  nli_reject:
    "The NLI cross-encoder determined that this subtask directly contradicts or is inconsistent with the authorized goal. The subtask appears to pursue an outcome that opposes the stated objective.",
  contrastive_reject:
    "The contrastive bi-encoder found that the semantic meaning of this subtask is too distant from the authorized goal. While not explicitly contradictory, the subtask drifts outside the intended scope.",
  both_reject:
    "Both the NLI cross-encoder and contrastive bi-encoder independently rejected this subtask. The subtask both contradicts the goal and is semantically unrelated — this is a strong rejection signal.",
  accepted: "",
};

let _msgId = 0;
function nextId() {
  return `msg-${++_msgId}-${Date.now()}`;
}

/* ── Mock evaluation (fallback when Sentinel server is unavailable) ─ */

/**
 * Lightweight keyword-overlap heuristic used as a demo when the FastAPI
 * inference service is offline. Not a substitute for the real NLI models.
 */
function mockEvaluate(goal: string, subtask: string): EvalResult {
  const goalWords = new Set(goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const subtaskWords = subtask.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

  // Danger words that strongly suggest the subtask is out of scope
  const dangerWords = [
    "delete", "destroy", "leak", "sell", "transfer", "expose", "share",
    "exfiltrate", "steal", "hack", "bypass", "disable", "circumvent",
    "collect agency", "third party", "external", "unauthorized", "override",
  ];
  const hasDanger = dangerWords.some((d) =>
    subtask.toLowerCase().includes(d),
  );

  const overlap = subtaskWords.filter((w) => goalWords.has(w)).length;
  const overlapRatio = goalWords.size > 0 ? overlap / goalWords.size : 0;

  // Simulate NLI score (p_contradiction): high = bad
  const nliScore = hasDanger ? 0.82 + Math.random() * 0.12 : Math.max(0.05, 0.35 - overlapRatio * 0.4 + Math.random() * 0.1);
  // Simulate contrastive cosine: low = bad
  const contrastiveScore = hasDanger ? -0.2 - Math.random() * 0.3 : Math.min(0.95, 0.45 + overlapRatio * 0.5 + Math.random() * 0.1);

  const nliThreshold = 0.5;
  const contrastiveThreshold = 0.3;

  const nliRejected = nliScore > nliThreshold;
  const contrastiveRejected = contrastiveScore < contrastiveThreshold;

  const reasons: string[] = [];
  if (nliRejected) reasons.push("nli_reject");
  if (contrastiveRejected) reasons.push("contrastive_reject");
  const rejectionReason =
    reasons.length === 2 ? "both_reject" : (reasons[0] ?? "accepted");

  return {
    result: !nliRejected && !contrastiveRejected,
    isRejected: nliRejected || contrastiveRejected,
    rejectionReason,
    nli: { score: nliScore, rejected: nliRejected, threshold: nliThreshold },
    contrastive: { score: contrastiveScore, rejected: contrastiveRejected, threshold: contrastiveThreshold },
    evaluatedAt: new Date().toISOString(),
    id: null,
    isMock: true,
  };
}

/* ── Mock task execution (simulates the agent doing the work) ──────── */

function generateMockExecution(goal: string, subtask: string): TaskExecution {
  const goalShort = goal.split(" ").slice(0, 4).join(" ");
  return {
    steps: [
      `Authenticating agent session for: ${goalShort}…`,
      `Validating authorization scope against policy…`,
      `Executing: ${subtask}`,
      `Writing audit log entry…`,
      `Reporting outcome to operator console…`,
    ],
    output: `✓ Task completed successfully.\n\nSubtask "${subtask}" was executed under goal "${goal}". All actions have been logged with timestamps and model scores for audit purposes.`,
  };
}

/* ── Meter ────────────────────────────────────────────────────────── */

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
    <div className="relative h-1.5 w-full border border-line bg-paper-soft">
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

/* ── TaskExecution display ────────────────────────────────────────── */

function TaskExecutionCard({ execution }: { execution: TaskExecution }) {
  return (
    <div className="mt-3 border border-line bg-paper-soft p-4">
      <div className="flex items-center gap-2 mb-3">
        <Play className="h-3.5 w-3.5 text-muted" />
        <span className="font-mono text-[10px] tracking-wider text-muted">EXECUTING TASK</span>
      </div>
      <div className="space-y-1.5 border-b border-line pb-3 mb-3">
        {execution.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-[9px] tracking-wider text-muted shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-mono text-[11px] text-ink-soft">{step}</span>
          </div>
        ))}
      </div>
      <pre className="font-mono text-[11px] leading-relaxed text-ink-soft whitespace-pre-wrap">
        {execution.output}
      </pre>
    </div>
  );
}

/* ── EvalCard ─────────────────────────────────────────────────────── */

function EvalCard({
  evaluation,
  goal,
  subtask,
}: {
  evaluation: EvalResult;
  goal: string;
  subtask: string;
}) {
  return (
    <div className="mt-3 border border-line bg-paper-soft p-4">
      {/* Verdict header */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center border border-ink",
            evaluation.isRejected ? "bg-ink text-paper" : "bg-paper text-ink",
          )}
        >
          {evaluation.isRejected ? (
            <ShieldX className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
        </span>
        <div>
          <p className="font-mono text-xs tracking-widest">
            {evaluation.isRejected ? "SUBTASK REJECTED" : "SUBTASK ACCEPTED"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            {REASON_LABEL[evaluation.rejectionReason] ?? evaluation.rejectionReason}
          </p>
        </div>
        {evaluation.isMock && (
          <span className="ml-auto font-mono text-[9px] tracking-wider text-muted border border-line px-1.5 py-0.5">
            DEMO
          </span>
        )}
      </div>

      {/* Rejection explanation */}
      {evaluation.isRejected && REJECTION_EXPLANATION[evaluation.rejectionReason] && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] leading-relaxed text-muted">
            <span className="font-mono tracking-wider text-ink">WHY: </span>
            {REJECTION_EXPLANATION[evaluation.rejectionReason]}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            The agent has been <span className="font-mono text-ink">blocked</span> from executing this subtask. Revise it so it stays within the scope of the authorized goal.
          </p>
        </div>
      )}

      {/* Model scores */}
      <div className="mt-3 space-y-3 border-t border-line pt-3">
        {[
          { name: "NLI · CONTRADICTION", model: evaluation.nli, signed: false, rejectIfHigh: true },
          { name: "CONTRASTIVE · COSINE", model: evaluation.contrastive, signed: true, rejectIfHigh: false },
        ].map((row) => (
          <div key={row.name}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] tracking-wider text-muted">{row.name}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] tabular-nums">{row.model.score.toFixed(3)}</span>
                <span className={cn(
                  "font-mono text-[9px] tracking-wider",
                  row.model.rejected ? "text-ink" : "text-muted"
                )}>
                  {row.model.rejected ? "✕ REJECT" : "✓ PASS"}
                </span>
              </div>
            </div>
            <div className="mt-1.5">
              <Meter value={row.model.score} threshold={row.model.threshold} signed={row.signed} />
            </div>
            <p className="mt-1 font-mono text-[9px] tracking-wider text-muted">
              THRESHOLD {row.model.threshold === null ? "—" : row.model.threshold.toFixed(2)}
              {" · "}{row.rejectIfHigh ? "REJECT IF SCORE > THRESHOLD" : "REJECT IF SCORE < THRESHOLD"}
            </p>
          </div>
        ))}
      </div>

      {/* Goal context */}
      <div className="mt-3 border-t border-line pt-3">
        <p className="font-mono text-[9px] tracking-wider text-muted">GOAL</p>
        <p className="mt-0.5 text-[11px] text-ink-soft">{goal}</p>
        <p className="mt-2 font-mono text-[9px] tracking-wider text-muted">SUBTASK</p>
        <p className="mt-0.5 text-[11px] text-ink-soft">{subtask}</p>
      </div>
    </div>
  );
}

/* ── GoalPicker ───────────────────────────────────────────────────── */

function GoalPicker({
  goals,
  onPick,
  disabled,
}: {
  goals: string[];
  onPick: (goal: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 space-y-2">
      {goals.map((goal, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onPick(goal)}
          className="group flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-all hover:border-gray-400 hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-40"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white border border-gray-200 font-mono text-[9px] tracking-wider text-gray-400 transition-colors group-hover:border-gray-400 group-hover:text-gray-600">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="text-base leading-relaxed text-gray-700">{goal}</span>
        </button>
      ))}
    </div>
  );
}

/* ── ChatBubble ───────────────────────────────────────────────────── */

function ChatBubble({
  message,
  onPickGoal,
  goalPickDisabled,
  activeGoal,
}: {
  message: ChatMessage;
  onPickGoal: (goal: string) => void;
  goalPickDisabled: boolean;
  activeGoal: string | null;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 items-start", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      {isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 border border-gray-200 text-muted">
          <span className="font-mono text-[9px] tracking-wider text-gray-500">YOU</span>
        </div>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1 border border-gray-100 shadow-sm">
          <SentinelLogoIcon className="h-7" />
        </div>
      )}

      {/* Content */}
      <div className={cn("max-w-[85%] min-w-0", isUser && "text-right")}>
        {/* Selected goal badge */}
        {message.selectedGoal && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-soft px-3 py-1 text-left">
            <Target className="h-3 w-3 text-muted" />
            <span className="font-mono text-[10px] tracking-wider text-muted">GOAL LOCKED</span>
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl px-4 py-3 shadow-sm",
            isUser
              ? "rounded-tr-sm bg-gray-100 border border-gray-200"
              : "rounded-tl-sm bg-white border border-gray-100",
          )}
        >
          <p className="text-base leading-relaxed whitespace-pre-wrap text-gray-800">{message.content}</p>

          {/* Goal list */}
          {message.goals && message.goals.length > 0 && (
            <GoalPicker goals={message.goals} onPick={onPickGoal} disabled={goalPickDisabled} />
          )}

          {/* Evaluating spinner */}
          {message.evaluating && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running dual-model evaluation…
            </div>
          )}

          {/* Executing spinner */}
          {message.executing && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Zap className="h-3.5 w-3.5 animate-pulse" />
              Agent executing task…
            </div>
          )}

          {/* Eval result */}
          {message.evaluation && (
            <EvalCard
              evaluation={message.evaluation}
              goal={activeGoal ?? ""}
              subtask={isUser ? message.content : ""}
            />
          )}

          {/* Task execution output */}
          {message.taskExecution && (
            <TaskExecutionCard execution={message.taskExecution} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Chatbot Component ───────────────────────────────────────── */

export function Chatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  // Remember the last evaluated subtask so EvalCard can display it
  const lastSubtaskRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  /* ── Send to DeepSeek for goal generation ──────────────────────── */
  const sendChat = useCallback(
    async (userText: string) => {
      const userMsg: ChatMessage = { id: nextId(), role: "user", content: userText };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      const apiMessages = [
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: userText },
      ];

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        const data = (await res.json().catch(() => null)) as {
          message?: string;
          goals?: string[];
          error?: { message?: string };
        } | null;

        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: "assistant",
          content: res.ok
            ? (data?.message ?? "")
            : (data?.error?.message ?? "Something went wrong. Please try again."),
          goals: res.ok ? (data?.goals ?? []) : [],
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", content: "Could not reach the assistant. Please try again." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages],
  );

  /* ── Evaluate a subtask then simulate execution ────────────────── */
  const evaluateSubtask = useCallback(
    async (subtask: string) => {
      if (!selectedGoal) return;
      lastSubtaskRef.current = subtask;

      const userMsg: ChatMessage = { id: nextId(), role: "user", content: subtask };
      const evalMsgId = nextId();
      const evalMsg: ChatMessage = {
        id: evalMsgId,
        role: "assistant",
        content: "Checking subtask against the authorized goal…",
        evaluating: true,
      };
      setMessages((prev) => [...prev, userMsg, evalMsg]);

      // ── Try real Sentinel endpoint, fall back to mock ───────────
      let evalResult: EvalResult;
      try {
        const res = await fetch("/api/playground", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ goal: selectedGoal, subtask }),
        });

        if (res.ok) {
          const data = (await res.json().catch(() => null)) as EvalResult | null;
          if (data && typeof data.isRejected === "boolean") {
            evalResult = data;
          } else {
            evalResult = mockEvaluate(selectedGoal, subtask);
          }
        } else {
          // Server returned error — use mock so the demo still works
          evalResult = mockEvaluate(selectedGoal, subtask);
        }
      } catch {
        // Network error — use mock
        evalResult = mockEvaluate(selectedGoal, subtask);
      }

      // ── Update the eval bubble ──────────────────────────────────
      if (evalResult.isRejected) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === evalMsgId
              ? {
                  ...m,
                  evaluating: false,
                  content: "Subtask rejected — the agent has been blocked.",
                  evaluation: evalResult,
                }
              : m,
          ),
        );
      } else {
        // Accepted: show eval result, then simulate task execution
        setMessages((prev) =>
          prev.map((m) =>
            m.id === evalMsgId
              ? {
                  ...m,
                  evaluating: false,
                  executing: true,
                  content: "Subtask accepted — running task…",
                  evaluation: evalResult,
                }
              : m,
          ),
        );

        // Simulate async execution delay
        await new Promise((r) => setTimeout(r, 1200));

        setMessages((prev) =>
          prev.map((m) =>
            m.id === evalMsgId
              ? {
                  ...m,
                  executing: false,
                  content: "Subtask accepted — task completed successfully.",
                  taskExecution: generateMockExecution(selectedGoal, subtask),
                }
              : m,
          ),
        );
      }
    },
    [selectedGoal],
  );

  /* ── Form submit ───────────────────────────────────────────────── */
  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    if (selectedGoal) {
      void evaluateSubtask(text);
    } else {
      void sendChat(text);
    }
  }, [input, loading, selectedGoal, evaluateSubtask, sendChat]);

  /* ── Goal selection ────────────────────────────────────────────── */
  const handlePickGoal = useCallback((goal: string) => {
    setSelectedGoal(goal);
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: "assistant",
        content: `Goal locked in. Now type a subtask below — I'll run it through Sentinel's dual-model verification and, if accepted, simulate the agent executing it.`,
        selectedGoal: goal,
      },
    ]);
  }, []);

  /* ── Reset ─────────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    setMessages([]);
    setSelectedGoal(null);
    setInput("");
    setLoading(false);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <Section id="playground">
      <div className="px-6 pb-6 pt-12 md:px-10 md:pt-16">
        <Eyebrow>Try Sentinel</Eyebrow>
        <h2 className="mt-6 max-w-2xl font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
          Chat with Sentinel.
        </h2>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted">
          Describe a scenario and get suggested goals. Pick one, then send
          subtasks — accepted tasks execute, rejected ones are blocked with a reason.
        </p>
      </div>

      {/* ── Modern rounded chatbot card ──────────────────────── */}
      <div className="mx-4 mb-6 rounded-2xl border border-gray-200 bg-white shadow-lg md:mx-6">

        {/* ── Chatbot header ──────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/80 px-5 py-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-sm border border-gray-100">
            <SentinelLogoIcon className="h-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Sentinel</p>
            <p className="text-[11px] text-gray-400">Dual-model alignment verification</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-medium text-gray-400">Live</span>
          </div>
        </div>

        {/* ── Chat area ──────────────────────────────────────── */}
        <div ref={scrollRef} className="h-[440px] overflow-y-auto bg-gray-50/40 px-5 py-5">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-sm border border-gray-100">
                <SentinelLogoIcon className="h-14" />
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500">
                Describe what your agent should do and I&apos;ll suggest goals to authorize.
                Then try sending subtasks to see them evaluated.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[
                  "Process insurance claims",
                  "Manage patient records",
                  "Handle customer support",
                  "Process payroll",
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:border-gray-400 hover:bg-gray-50 hover:shadow"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  onPickGoal={handlePickGoal}
                  goalPickDisabled={selectedGoal !== null}
                  activeGoal={selectedGoal}
                />
              ))}
              {loading && (
                <div className="flex gap-3 items-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1 border border-gray-100 shadow-sm">
                    <SentinelThinkingIcon thinking className="h-7" />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white border border-gray-100 px-4 py-3 text-sm text-gray-500 shadow-sm">
                    Generating goals…
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Active goal banner ─────────────────────────────── */}
        {selectedGoal && (
          <div className="flex items-center gap-3 border-t border-gray-100 bg-blue-50/60 px-5 py-2.5">
            <Target className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-blue-600">
              {selectedGoal}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedGoal(null);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: nextId(),
                    role: "assistant",
                    content: "Goal cleared. Describe a new scenario to get fresh goal suggestions.",
                  },
                ]);
              }}
              className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600"
            >
              Clear
            </button>
          </div>
        )}

        {/* ── Input bar ──────────────────────────────────────── */}
        <div className="flex items-end gap-2.5 border-t border-gray-100 bg-white px-4 py-4">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={
              selectedGoal
                ? "Type a subtask to evaluate and run…"
                : "Describe a scenario for your agent…"
            }
            className="min-h-[42px] max-h-[120px] flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base leading-relaxed text-gray-800 outline-none placeholder:text-gray-400 transition-colors focus:border-gray-400 focus:bg-white focus:shadow-sm"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm transition-all hover:bg-gray-700 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleReset}
              title="Reset conversation"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition-all hover:border-gray-400 hover:text-gray-600"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── Footer hint ────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-5 py-2">
          <div className="flex items-center gap-3">
            <span className={cn("h-1.5 w-1.5 rounded-full", selectedGoal ? "bg-blue-400" : "bg-gray-300")} />
            <span className="text-[11px] font-medium text-gray-400">
              {selectedGoal ? "Evaluating subtasks" : "Goal generation mode"}
            </span>
            {selectedGoal && (
              <span className="text-[11px] text-gray-300">·</span>
            )}
            {selectedGoal && (
              <span className="text-[11px] text-gray-400">Accept → Execute · Reject → Block</span>
            )}
          </div>
          <span className="hidden text-[11px] text-gray-300 sm:inline">↵ to send</span>
        </div>
      </div>
    </Section>
  );
}
