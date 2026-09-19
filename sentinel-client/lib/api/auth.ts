/**
 * Server-side client for the Express gateway's auth endpoints.
 *
 * This module only ever runs on the server (Proxy, Server Components, Server
 * Actions, Route Handlers) — the token pair it handles must never reach the
 * browser. Contract: `express-server/API.md`.
 */

const BASE_URL = (process.env.SENTINEL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;

export type ApiUser = {
  id: string;
  email: string;
  fullName: string | null;
  isAdmin: boolean;
  createdAt: string;
};

export type AuthSession = {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
};

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;

  constructor(code: string, message: string, status: number, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type Envelope<T> = {
  data?: T;
  error?: { code?: string; message?: string; details?: FieldErrors };
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { accept: "application/json", ...init.headers },
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

function postJson(path: string, body: unknown): Promise<unknown> {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function login(email: string, password: string): Promise<AuthSession> {
  return postJson("/api/auth/login", { email, password }) as Promise<AuthSession>;
}

export function register(input: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<AuthSession> {
  return postJson("/api/auth/register", input) as Promise<AuthSession>;
}

export function refresh(refreshToken: string): Promise<AuthSession> {
  return postJson("/api/auth/refresh", { refreshToken }) as Promise<AuthSession>;
}

export async function me(accessToken: string): Promise<ApiUser> {
  const data = await request<{ user: ApiUser }>("/api/auth/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return data.user;
}

/**
 * Best-effort refresh-token revocation on sign-out.
 * `POST /api/auth/logout` is guarded by console auth, so the (short-lived)
 * access token is required; callers treat any failure as non-fatal.
 */
export async function logout(refreshToken: string, accessToken: string): Promise<void> {
  await request("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ refreshToken }),
  });
}
