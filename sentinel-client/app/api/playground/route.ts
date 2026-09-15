import { NextResponse } from "next/server";

/**
 * Server-side proxy for the landing-page playground.
 *
 * The browser posts { goal, subtask } here; this handler calls the Express
 * gateway's `POST /api/evaluate` using a server-held API key, so no credential
 * is ever exposed to the client.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 2000;
const MAX_REQUESTS_PER_WINDOW = 20;
const WINDOW_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 15_000;

// Per-instance, in-memory limiter. Fine for a single dev instance; a shared
// store (Redis) would be needed for multi-instance deployments.
const hits = new Map<string, number[]>();

function isRateLimited(clientId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(clientId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(clientId, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

function clientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}

function fail(code: string, message: string, status: number, details?: Record<string, string>) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

type UpstreamModel = {
  score?: number;
  result?: boolean;
  rejected?: boolean;
  threshold?: number;
};

type UpstreamEvaluate = {
  result?: boolean;
  date?: string;
  id?: string;
  nli?: UpstreamModel;
  contrastive?: UpstreamModel;
  error?: { code?: string; message?: string; details?: Record<string, string> };
};

type PlaygroundBody = { goal?: unknown; subtask?: unknown };

function modelVerdict(model: UpstreamModel | undefined) {
  // Express returns per-model `result` (true = accepted); the gateway may also
  // expose the raw `rejected` flag. Support both.
  const rejected = model?.rejected === true || model?.result === false;
  return {
    score: model?.score ?? 0,
    rejected,
    threshold: model?.threshold ?? null,
  };
}

export async function POST(request: Request) {
  const apiUrl = (process.env.SENTINEL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
  const apiKey = process.env.SENTINEL_API_KEY;

  let body: PlaygroundBody;
  try {
    body = (await request.json()) as PlaygroundBody;
  } catch {
    return fail("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const subtask = typeof body.subtask === "string" ? body.subtask.trim() : "";

  if (!goal || !subtask) {
    const details: Record<string, string> = {};
    if (!goal) details.goal = "A goal is required.";
    if (!subtask) details.subtask = "A subtask is required.";
    return fail("VALIDATION_ERROR", "Both a goal and a subtask are required.", 400, details);
  }

  if (goal.length > MAX_TEXT || subtask.length > MAX_TEXT) {
    return fail(
      "VALIDATION_ERROR",
      `Goal and subtask must be at most ${MAX_TEXT} characters.`,
      400,
    );
  }

  if (isRateLimited(clientId(request))) {
    return fail("RATE_LIMITED", "Too many playground requests. Try again in a minute.", 429);
  }

  if (!apiKey) {
    return fail(
      "PLAYGROUND_NOT_CONFIGURED",
      "The playground is not configured on this server. Set SENTINEL_API_KEY (and SENTINEL_API_URL) to an API key issued by the gateway.",
      503,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${apiUrl}/api/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ goal, subtask, mode: "detailed" }),
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await upstream.json().catch(() => null)) as UpstreamEvaluate | null;

    if (!upstream.ok) {
      return fail(
        payload?.error?.code ?? "UPSTREAM_ERROR",
        payload?.error?.message ?? "The evaluation service returned an error.",
        upstream.status,
        payload?.error?.details,
      );
    }

    const nli = modelVerdict(payload?.nli);
    const contrastive = modelVerdict(payload?.contrastive);

    const reasons: string[] = [];
    if (nli.rejected) reasons.push("nli_reject");
    if (contrastive.rejected) reasons.push("contrastive_reject");
    const rejectionReason = reasons.length === 2 ? "both_reject" : (reasons[0] ?? "accepted");

    return NextResponse.json({
      result: payload?.result === true,
      isRejected: payload?.result !== true,
      rejectionReason,
      nli,
      contrastive,
      evaluatedAt: payload?.date ?? new Date().toISOString(),
      id: payload?.id ?? null,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return fail(
      "UPSTREAM_UNAVAILABLE",
      aborted
        ? "The evaluation service timed out."
        : "Could not reach the evaluation service. Is the Express server running?",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}
