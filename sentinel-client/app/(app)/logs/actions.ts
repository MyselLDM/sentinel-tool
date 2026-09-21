"use server";

/**
 * Server Actions for the logs viewer.
 * Runs on the server so the access token never reaches the browser.
 * Contract: express-server/API.md §6.
 */

import { listRequests } from "@/lib/api/requests";
import type { PageMeta, RequestFilters, RequestListItem } from "@/lib/api/requests";
import { readSession } from "@/lib/auth/session";

// Re-export types for client components
export type { PageMeta, RequestFilters, RequestListItem };

export type FetchLogsResult =
  | { ok: true; requests: RequestListItem[]; meta: PageMeta }
  | { ok: false; message: string };

async function getToken(): Promise<string> {
  const session = await readSession();
  if (!session) throw new Error("Not authenticated");
  return session.accessToken;
}

export async function fetchLogsAction(
  filters: RequestFilters,
): Promise<FetchLogsResult> {
  try {
    const token = await getToken();
    const { requests, meta } = await listRequests(token, filters);
    return { ok: true, requests, meta };
  } catch (err) {
    const e = err as { message?: string };
    return { ok: false, message: e.message ?? "Failed to load logs." };
  }
}

/**
 * Returns the raw CSV content as a string so the client can trigger a download.
 * We can't return a Response from a server action, so we return the text content
 * and let the client create a Blob URL.
 *
 * Filters pagination params are stripped (the server ignores them for export).
 */
export async function exportCsvAction(
  filters: Omit<RequestFilters, "page" | "pageSize" | "sort">,
): Promise<{ ok: true; csv: string } | { ok: false; message: string }> {
  try {
    const token = await getToken();
    // Build the URL directly since exportRequestsCsv returns a Response
    const BASE_URL = (process.env.SENTINEL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.status) params.set("status", filters.status);
    if (filters.q) params.set("q", filters.q);
    if (filters.mode) params.set("mode", filters.mode);
    const qs = params.toString();
    const url = `${BASE_URL}/api/requests/export.csv${qs ? `?${qs}` : ""}`;

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, message: `Export failed: HTTP ${response.status}` };
    }

    const csv = await response.text();
    return { ok: true, csv };
  } catch (err) {
    const e = err as { message?: string };
    return { ok: false, message: e.message ?? "Export failed." };
  }
}
