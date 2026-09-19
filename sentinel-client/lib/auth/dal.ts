import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { me } from "@/lib/api/auth";
import type { ApiUser } from "@/lib/api/auth";
import { readSession } from "./session";

/**
 * Data Access Layer — the authoritative auth boundary for the console.
 *
 * Every protected read/render flows through here. The Proxy only does optimistic
 * cookie-presence checks; the real check lives next to the data (this file).
 */

/** The signed-in operator, or `null`. Never redirects (used by public routes). */
export const getCurrentUser = cache(async (): Promise<ApiUser | null> => {
  const tokens = await readSession();
  if (!tokens) return null;
  try {
    return await me(tokens.accessToken);
  } catch {
    // Expired access token, revoked session, or the gateway is unreachable.
    return null;
  }
});

/** Current pathname+search, as forwarded by the Proxy (`x-sentinel-path`). */
async function currentPath(): Promise<string> {
  const store = await headers();
  return store.get("x-sentinel-path") ?? "/dashboard";
}

/**
 * Require a valid session for a protected route, redirecting otherwise.
 *
 * When the *access* token has lapsed, we hand off to the refresh route handler
 * (`/api/auth/refresh`) — the only place that can rotate the pair and write the
 * cookie back — which returns the operator to `next`. If the refresh token is
 * dead too, that handler clears the session and sends them to `/login`.
 */
export const verifySession = cache(async (): Promise<ApiUser> => {
  const tokens = await readSession();
  if (!tokens) redirect("/login");

  const user = await getCurrentUser();
  if (user) return user;

  redirect(`/api/auth/refresh?next=${encodeURIComponent(await currentPath())}`);
});
