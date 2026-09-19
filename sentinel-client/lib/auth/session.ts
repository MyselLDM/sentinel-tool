import { cookies } from "next/headers";

import { SESSION_COOKIE, decodeSession, encodeSession, sessionCookieOptions } from "./config";
import type { SessionTokens } from "./config";

/**
 * Session cookie mechanics. Reads happen during render; writes only work in a
 * Server Action or Route Handler (HTTP forbids setting cookies after streaming
 * starts), which is exactly where these are called from.
 */

export async function readSession(): Promise<SessionTokens | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export async function createSession(tokens: SessionTokens): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(tokens), sessionCookieOptions());
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export { SESSION_COOKIE, encodeSession, sessionCookieOptions };
