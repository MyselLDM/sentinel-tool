import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ApiError, refresh } from "@/lib/api/auth";
import { SESSION_COOKIE, encodeSession, safeNextPath, sessionCookieOptions } from "@/lib/auth/config";
import { readSession } from "@/lib/auth/session";

/**
 * Rotate the session's token pair.
 *
 * The DAL redirects here when it detects an expired access token, because a
 * Route Handler is one of the few places allowed to write the session cookie.
 * On success the operator is returned to `next`; otherwise the session is
 * cleared and they land on `/login`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Only our own (same-origin) redirect should trigger a rotation or a
  // session clear; a cross-site top-level navigation must not force a logout.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const tokens = await readSession();

  if (tokens) {
    try {
      const session = await refresh(tokens.refreshToken);
      const response = NextResponse.redirect(new URL(next, request.url), 303);
      response.cookies.set(
        SESSION_COOKIE,
        encodeSession({ accessToken: session.accessToken, refreshToken: session.refreshToken }),
        sessionCookieOptions(),
      );
      return response;
    } catch (error) {
      // A definitive "token is dead" clears the session; a transient gateway
      // outage keeps it, so a later retry can still recover it.
      const revoked = error instanceof ApiError && (error.status === 401 || error.status === 403);
      if (revoked) return clearAndRedirect(request);
      return NextResponse.redirect(new URL("/login", request.url), 303);
    }
  }

  return clearAndRedirect(request);
}

function clearAndRedirect(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return response;
}
