import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tokens = await readSession();
  if (!tokens) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const upstreamUrl = new URL(
    `${(process.env.SENTINEL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "")}/api/requests/export.csv`,
  );

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    upstreamUrl.searchParams.set(key, value);
  }

  const upstream = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      authorization: `Bearer ${tokens.accessToken}`,
      accept: "text/csv,text/plain,*/*",
    },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const payload = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_EXPORT_ERROR",
          message: payload || "The gateway could not export the CSV.",
        },
      },
      { status: upstream.status },
    );
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  const headers = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (key.toLowerCase() === "transfer-encoding") continue;
    headers.set(key, value);
  }

  return new NextResponse(body, {
    status: upstream.status,
    headers,
  });
}
