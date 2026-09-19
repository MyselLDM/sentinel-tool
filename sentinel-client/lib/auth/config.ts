/**
 * Session primitives shared by the Proxy (Node/Edge-agnostic) and server code.
 *
 * The gateway (Express) is the source of truth for auth: it issues short-lived
 * access JWTs plus rotating refresh JWTs. We keep that pair in a single
 * httpOnly cookie — a **stateless session** — and never expose it to the
 * browser. Nothing here imports `next/headers` so it is safe to use from
 * `proxy.ts` as well as Server Components/Actions/Route Handlers.
 */

export const SESSION_COOKIE = "sentinel_session";

/** Refresh-token lifetime used as the session cookie's max-age. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7d — must track JWT_REFRESH_TTL.

export type SessionTokens = { accessToken: string; refreshToken: string };

/** Cookie options used by every writer of the session cookie. */
export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// ── base64url (ASCII-safe: JWTs and their JSON wrapper are ASCII) ────────────
function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

export function encodeSession(tokens: SessionTokens): string {
  return toBase64Url(JSON.stringify(tokens));
}

export function decodeSession(value: string | undefined | null): SessionTokens | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<SessionTokens>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") {
      return null;
    }
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

/**
 * Only allow same-origin, path-only redirect targets (no open redirects).
 *
 * Parsed, not prefix-matched: WHATWG URL parsing strips ASCII tab/newline
 * characters *before* resolving, so `"/\t/evil.com"` would slip past a naive
 * `//`-prefix check and then resolve cross-origin.
 */
export function safeNextPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    const base = "http://sentinel.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
