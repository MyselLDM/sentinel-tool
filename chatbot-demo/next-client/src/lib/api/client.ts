import { readSession } from "@/lib/auth/session";
import { ApiError } from "./auth";

export { ApiError };

const BASE_URL = (process.env.SENTINEL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
};

type Envelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, string>;
  };
};

/**
 * Server-side authenticated API client for the Express gateway.
 * Automatically injects the session access token and unwraps the { data: T } envelope.
 */
export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? (await readSession())?.accessToken;

  if (!token) {
    throw new ApiError("UNAUTHORIZED", "Authentication required to access this resource.", 401);
  }

  const searchParams = new URLSearchParams();
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
  }

  const queryString = searchParams.toString();
  const url = `${BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
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
      payload?.error?.message ?? `Gateway returned HTTP status ${response.status}`,
      response.status,
      payload?.error?.details,
    );
  }

  if (!payload || payload.data === undefined) {
    throw new ApiError("UPSTREAM_BAD_RESPONSE", "The gateway returned an unexpected response structure.", 502);
  }

  return payload.data;
}
