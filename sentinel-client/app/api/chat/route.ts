import { NextResponse } from "next/server";

/**
 * Server-side proxy for the landing-page chatbot.
 *
 * The browser posts the conversation history here; this handler calls Google's
 * Gemini API using a server-held API key, so no credential is ever
 * exposed to the client.
 *
 * Performance notes:
 * - Per-model timeout is 20 s; total wall-clock cap is 60 s.
 * - Models are tried in order; first success wins.
 * - The 30 s UPSTREAM_TIMEOUT_MS that previously caused "timed out" errors
 *   has been raised to 60 s and individual fetches now each get their own
 *   AbortController so a slow model doesn't eat the whole budget.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUESTS_PER_WINDOW = 30;
const WINDOW_MS = 60_000;
const PER_MODEL_TIMEOUT_MS = 20_000; // per attempt, not total
const TOTAL_TIMEOUT_MS = 60_000;

const hits = new Map<string, number[]>();

function isRateLimited(id: string): boolean {
  const now = Date.now();
  const recent = (hits.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(id, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

function clientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const SYSTEM_INSTRUCTION = `You are the Sentinel Assistant — a helpful chatbot embedded in the Sentinel security gateway's website. Sentinel is a security verification tool for autonomous AI agents.

## What Sentinel Does
Sentinel checks every subtask an AI agent proposes against its authorized goal before the agent executes it. Two independently fine-tuned MiniLM models each score the goal/subtask pair:
- **NLI cross-encoder**: Checks if the subtask *contradicts* the authorized goal
- **Contrastive bi-encoder**: Checks if the subtask is *semantically close* to the goal
- **Rule**: If EITHER model rejects, the subtask is blocked

## Architecture
- **sentinel-client**: Marketing site + operator console (Next.js 16, React 19, Tailwind v4, daisyUI 5)
- **express-server**: API gateway handling auth, API keys, rate limits, logging, stats, and inference proxy (Node, Express 5)
- **fastapi**: Model inference service — the only place models run (Python 3.12, FastAPI, sentence-transformers, torch)

## API
- \`POST /api/evaluate\` — Send a goal and subtask, get back accept/reject with scores
- API keys authenticate requests; each key has a per-minute rate limit
- Responses include per-model scores, thresholds, and the reason for rejection

## Your Behavior
When a user sends you a query or describes a scenario, respond with a JSON object:

{
  "message": "Your conversational response",
  "goals": ["Goal 1", "Goal 2", "Goal 3", "Goal 4", "Goal 5"]
}

**Rules:**
- Always generate AT LEAST 5 goals relevant to the user's query
- Goals should be realistic, specific, and actionable agent objectives
- The message should be friendly and explain the goals
- Always respond with valid JSON matching the schema exactly`;

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequestBody = {
  messages?: ChatMessage[];
};

/** Try a single model with its own per-request AbortController. */
async function tryModel(
  model: string,
  apiKey: string,
  contents: { role: string; parts: { text: string }[] }[],
  parentSignal: AbortSignal,
): Promise<{ message: string; goals: string[] } | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PER_MODEL_TIMEOUT_MS);
  // Also abort if the parent budget expires
  parentSignal.addEventListener("abort", () => ctl.abort(), { once: true });

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              message: { type: "STRING" },
              goals: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["message", "goals"],
          },
        },
      }),
      signal: ctl.signal,
    });

    if (!res.ok) return null;

    const payload = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;

    const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let parsed: { message?: string; goals?: string[] };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      parsed = { message: raw, goals: [] };
    }
    return {
      message: parsed.message ?? "",
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return fail(
      "CHAT_NOT_CONFIGURED",
      "The chat assistant is not configured. Set GEMINI_API_KEY in the environment.",
      503,
    );
  }

  if (isRateLimited(clientId(request))) {
    return fail("RATE_LIMITED", "Too many requests. Try again in a minute.", 429);
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return fail("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return fail("VALIDATION_ERROR", "At least one message is required.", 400);
  }

  const contents = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content).slice(0, 4000) }],
    }));

  // Models ordered by speed/reliability for this API key.
  const candidateModels = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-pro-latest",
  ];

  // Overall budget — aborts whichever model is currently running
  const budgetCtl = new AbortController();
  const budgetTimer = setTimeout(() => budgetCtl.abort(), TOTAL_TIMEOUT_MS);

  try {
    for (const model of candidateModels) {
      if (budgetCtl.signal.aborted) break;
      const result = await tryModel(model, apiKey, contents, budgetCtl.signal);
      if (result) return NextResponse.json(result);
    }
    return fail("UPSTREAM_UNAVAILABLE", "The Sentinel Assistant is busy right now. Please try again in a moment.", 503);
  } finally {
    clearTimeout(budgetTimer);
  }
}
