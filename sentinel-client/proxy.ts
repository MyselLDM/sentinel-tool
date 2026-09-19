import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "@/lib/auth/config";

/**
 * Optimistic auth gate (Next 16's rename of Middleware).
 *
 * Only a cookie-presence check — no token verification, no data fetching. The
 * authoritative check lives in the DAL (`lib/auth/dal.ts`). We forward the
 * current path to the app via `x-sentinel-path` so a protected page can bounce
 * through the refresh handler and return the operator to where they were.
 *
 * NOTE: keep `PROTECTED_PREFIXES` in sync with the routes under `app/(app)/`
 * (the layout there is the real enforcement, but this list is what bounces
 * unauthenticated visitors before any render).
 */
const PROTECTED_PREFIXES = ["/dashboard", "/api-keys", "/logs", "/settings"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const currentPath = `${pathname}${search}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-sentinel-path", currentPath);

  if (isProtected(pathname) && !decodeSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", currentPath);

    const response = NextResponse.redirect(loginUrl);
    // A present-but-unreadable cookie would loop forever — drop it.
    if (request.cookies.has(SESSION_COOKIE)) {
      response.cookies.delete({ name: SESSION_COOKIE, path: "/" });
    }
    return response;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Run on everything except API routes and static assets.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|ico|webp|woff2?|txt|xml)$).*)",
  ],
};
