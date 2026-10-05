/**
 * Server-side client for the Express gateway's API-key endpoints.
 *
 * Runs only on the server (Server Components, Server Actions, Route Handlers).
 * Contract: `express-server/API.md` §4.
 *
 * Response envelope: `{ data: T }` for success, `{ error: { code, message, details? } }` for
 * errors. The `key` field (plaintext secret) is returned only once on creation and must be
 * shown to the operator immediately — do not persist it beyond the single render.
 */

const BASE_URL = (process.env.SENTINEL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;

// ── Shared error type (re-exported so callers can import it from here) ────────

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

// ── Data shapes (from API.md §1.4) ────────────────────────────────────────────

/**
 * Masked API-key record — never contains the plaintext secret.
 * Returned by GET /api/keys, GET /api/keys/:id, PATCH /api/keys/:id.
 */
export type ApiKey = {
  id: string;
  keyName: string;
  /** e.g. "sk_test_8f3a" */
  prefix: string;
  /** Last 4 chars of the plaintext key */
  last4: string;
  isActive: boolean;
  rateLimitPerMinute: number;
  createdAt: string;
  /** null when the key has never been used */
  lastUsedAt: string | null;
  /** null = never expires */
  expiresAt: string | null;
};

/**
 * Result of POST /api/keys. The `key` field is the full plaintext secret —
 * returned exactly once. Callers must display and forget it.
 */
export type CreateKeyResult = {
  /** Full plaintext API key, e.g. "sk_test_8f3a…b1c9". Present **only** here. */
  key: string;
  record: ApiKey;
};

// ── Input types ────────────────────────────────────────────────────────────────

export type CreateKeyInput = {
  /** 1–100 chars, required */
  keyName: string;
  /** 1–10000, optional (defaults to server's RATE_LIMIT_DEFAULT_PER_MIN) */
  rateLimitPerMinute?: number;
  /** ISO string, must be in the future; null/undefined = never expires */
  expiresAt?: string | null;
};

export type UpdateKeyInput = {
  isActive?: boolean;
  keyName?: string;
};

// ── Internal fetch helper ─────────────────────────────────────────────────────

type Envelope<T> = {
  data?: T;
  error?: { code?: string; message?: string; details?: Record<string, string> };
};

async function request<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
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

  return payload.data;
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * GET /api/keys — list masked keys owned by the authenticated user.
 * Response envelope: `{ data: { keys: ApiKey[] } }`
 */
export async function listKeys(accessToken: string): Promise<ApiKey[]> {
  const data = await request<{ keys: ApiKey[] }>("/api/keys", accessToken);
  return data.keys;
}

/**
 * POST /api/keys — create a new API key.
 * ⚠️ The plaintext `key` field is returned exactly once in the response.
 */
export async function createKey(
  accessToken: string,
  input: CreateKeyInput,
): Promise<CreateKeyResult> {
  return request<CreateKeyResult>("/api/keys", accessToken, jsonInit(input));
}

/**
 * PATCH /api/keys/:id — activate, deactivate, or rename a key.
 * Response envelope: `{ data: { key: ApiKey } }`
 */
export async function updateKey(
  accessToken: string,
  id: string,
  input: UpdateKeyInput,
): Promise<ApiKey> {
  const data = await request<{ key: ApiKey }>(`/api/keys/${id}`, accessToken, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.key;
}

/**
 * DELETE /api/keys/:id — permanently delete a key.
 * Response envelope: `{ data: { id, deleted: true } }`
 */
export async function deleteKey(
  accessToken: string,
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return request<{ id: string; deleted: boolean }>(`/api/keys/${id}`, accessToken, {
    method: "DELETE",
  });
}
