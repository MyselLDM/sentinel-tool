/**
 * Server-side client for the Express gateway's request-log endpoints.
 *
 * Runs only on the server (Server Components, Server Actions, Route Handlers).
 * Contract: `express-server/API.md` §6.
 *
 * All endpoints are scoped to the calling user's own API keys.
 */

const BASE_URL = (process.env.SENTINEL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;

// ── Shared error type ─────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: string,
    message: string,
    status: number,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

// ── Data shapes (from API.md §1.4 and §6) ────────────────────────────────────

/**
 * A single row in the requests list.
 * Returned by GET /api/requests and GET /api/stats/recent.
 */
export type RequestListItem = {
  id: string;
  requestId: string;
  createdAt: string;
  goal: string;
  subtask: string;
  isRejected: boolean;
  rejectionReason: string;
  responseTimeMs: number;
  modelVersion: string;
  evaluationMode: string;
};

/**
 * Per-model result block as returned by GET /api/requests/:requestId.
 * nli.result / contrastive.result are the stored model-reject booleans
 * (true = model rejected).
 */
export type ModelDetail = {
  score: number;
  result: boolean;
  threshold: number;
};

export type NliDetail = ModelDetail & {
  /** Label-keyed probabilities: { contradiction, entailment, neutral } */
  rawScores: {
    contradiction: number;
    entailment: number;
    neutral: number;
  };
};

/** Full evaluation detail returned by GET /api/requests/:requestId */
export type RequestDetail = {
  id: string;
  requestId: string;
  createdAt: string;
  goal: string;
  subtask: string;
  isRejected: boolean;
  rejectionReason: string;
  nli: NliDetail;
  contrastive: ModelDetail;
  responseTimeMs: number;
  modelVersion: string;
  evaluationMode: string;
  userAgent: string | null;
  apiKeyId: string;
};

/** Pagination metadata returned by GET /api/requests */
export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Filters supported by GET /api/requests (and export.csv) */
export type RequestFilters = {
  /** ISO date — lower bound on createdAt */
  from?: string;
  /** ISO date — upper bound on createdAt */
  to?: string;
  /** Maps to isRejected */
  status?: "accepted" | "rejected";
  /** Substring match on requestId */
  q?: string;
  /** Match evaluationMode */
  mode?: "standard" | "detailed";
  page?: number;
  pageSize?: number;
  /** Default "created_at". */
  sort?: "created_at" | "response_time_ms";
};

// ── Internal helpers ──────────────────────────────────────────────────────────

type Envelope<T> = {
  data?: T;
  meta?: PageMeta;
  error?: { code?: string; message?: string; details?: Record<string, string> };
};

/** Build a query string from the filters, omitting undefined/null values. */
function buildQuery(filters: RequestFilters): string {
  const params = new URLSearchParams();
  const add = (key: string, val: string | number | undefined) => {
    if (val !== undefined && val !== "") params.set(key, String(val));
  };
  add("from", filters.from);
  add("to", filters.to);
  add("status", filters.status);
  add("q", filters.q);
  add("mode", filters.mode);
  add("page", filters.page);
  add("pageSize", filters.pageSize);
  add("sort", filters.sort);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function request<T, M = undefined>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<{ data: T; meta?: M }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "UPSTREAM_UNAVAILABLE",
      "Could not reach the Sentinel gateway. Is the Express server running?",
      503,
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.code ?? "UPSTREAM_ERROR",
      payload?.error?.message ?? "The gateway returned an error.",
      response.status,
      payload?.error?.details,
    );
  }

  if (!payload || payload.data === undefined) {
    throw new ApiError("UPSTREAM_BAD_RESPONSE", "The gateway returned an unexpected response.", 502);
  }

  return { data: payload.data, meta: payload.meta as M | undefined };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * GET /api/requests — paginated, filterable evaluation log.
 * Returns both the rows and pagination metadata.
 */
export async function listRequests(
  accessToken: string,
  filters: RequestFilters = {},
): Promise<{ requests: RequestListItem[]; meta: PageMeta }> {
  const { data, meta } = await request<{ requests: RequestListItem[] }, PageMeta>(
    `/api/requests${buildQuery(filters)}`,
    accessToken,
  );
  return {
    requests: data.requests,
    meta: meta ?? { page: 1, pageSize: 25, total: 0, totalPages: 0 },
  };
}

/**
 * GET /api/requests/:requestId — full evaluation detail.
 * The requestId here is the public-facing UUID (not the internal row id).
 */
export async function getRequest(
  accessToken: string,
  requestId: string,
): Promise<RequestDetail> {
  const { data } = await request<{ request: RequestDetail }>(
    `/api/requests/${requestId}`,
    accessToken,
  );
  return data.request;
}

/**
 * GET /api/requests/export.csv — authenticated CSV download.
 *
 * Returns the raw `Response` object so the caller can stream or read the body.
 * Filters are forwarded to the server (pagination params ignored by the backend).
 *
 * Because this endpoint requires a JWT (console auth), we use an authenticated
 * fetch rather than an unauthenticated <a href>.
 */
export async function exportRequestsCsv(
  accessToken: string,
  filters: Omit<RequestFilters, "page" | "pageSize"> = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000); // CSV may be large

  try {
    const response = await fetch(
      `${BASE_URL}/api/requests/export.csv${buildQuery(filters)}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new ApiError("EXPORT_FAILED", "CSV export request failed.", response.status);
    }

    return response;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      "UPSTREAM_UNAVAILABLE",
      "Could not reach the Sentinel gateway.",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}
