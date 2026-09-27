"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Check,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldX,
  Target,
  X,
  Zap,
} from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";

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
    <div className="mt-3 space-y-1.5">
      {goals.map((goal, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onPick(goal)}
          className="group flex w-full items-start gap-2.5 border border-line bg-paper px-3 py-2.5 text-left transition-colors hover:border-ink hover:bg-paper-soft disabled:pointer-events-none disabled:opacity-40"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-line-strong font-mono text-[9px] tracking-wider text-muted transition-colors group-hover:border-ink group-hover:text-ink">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="text-sm leading-relaxed">{goal}</span>
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
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center border",
          isUser
            ? "border-line-strong bg-paper text-muted"
            : "border-ink bg-ink text-paper",
        )}
      >
        {isUser ? (
          <span className="font-mono text-[9px] tracking-wider">YOU</span>
        ) : (
          <MessageSquare className="h-3 w-3" />
        )}
      </div>

      {/* Content */}
      <div className={cn("max-w-[88%] min-w-0", isUser && "text-right")}>
        {/* Selected goal badge */}
        {message.selectedGoal && (
          <div className="mb-2 inline-flex items-center gap-1.5 border border-line bg-paper-soft px-2 py-1 text-left">
            <Target className="h-3 w-3 text-muted" />
            <span className="font-mono text-[10px] tracking-wider text-muted">GOAL LOCKED</span>
          </div>
        )}

        <div
          className={cn(
            "border px-3.5 py-2.5",
            isUser ? "border-line bg-paper-soft" : "border-line bg-paper",
          )}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>

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

  /* ── Send to Gemini for goal generation ────────────────────────── */
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

      <div className="border-t border-line">
        {/* ── Chat area ──────────────────────────────────────────── */}
        <div ref={scrollRef} className="h-[480px] overflow-y-auto px-6 py-6 md:px-10">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center border border-line">
                <MessageSquare className="h-5 w-5 text-muted" />
              </div>
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
                Describe what your agent should do and I&apos;ll suggest goals to authorize.
                Then try sending subtasks to see them evaluated.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
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
                    className="border border-line px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-muted transition-colors hover:border-ink hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-ink bg-ink text-paper">
                    <MessageSquare className="h-3 w-3" />
                  </div>
                  <div className="flex items-center gap-2 border border-line px-3.5 py-2.5 text-sm text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating goals…
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Active goal banner ──────────────────────────────────── */}
        {selectedGoal && (
          <div className="flex items-center gap-3 border-t border-line bg-paper-soft px-6 py-2.5 md:px-10">
            <Target className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-wider text-muted">
              GOAL: {selectedGoal}
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
              className="shrink-0 font-mono text-[10px] tracking-wider text-muted transition-colors hover:text-ink"
            >
              CLEAR
            </button>
          </div>
        )}

        {/* ── Input bar ──────────────────────────────────────────── */}
        <div className="flex items-end gap-3 border-t border-line px-6 py-4 md:px-10">
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
            className="min-h-[40px] max-h-[120px] flex-1 resize-none border border-line bg-paper p-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-ink"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className="inline-flex h-10 w-10 items-center justify-center border border-ink bg-ink text-paper transition-colors hover:bg-ink-soft hover:border-ink-soft disabled:pointer-events-none disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleReset}
              title="Reset conversation"
              className="inline-flex h-10 w-10 items-center justify-center border border-line text-muted transition-colors hover:border-ink hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── Footer hint ────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-line px-6 py-2 md:px-10">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] tracking-wider text-muted">
              {selectedGoal ? "● EVALUATING" : "○ GOAL GENERATION"}
            </span>
            {selectedGoal && (
              <span className="font-mono text-[10px] tracking-wider text-muted">
                ACCEPT → EXECUTE · REJECT → BLOCK
              </span>
            )}
          </div>
          <span className="hidden font-mono text-[10px] tracking-wider text-muted sm:inline">
            ENTER TO SEND · SHIFT+ENTER FOR NEWLINE
          </span>
        </div>
      </div>
    </Section>
  );
}
