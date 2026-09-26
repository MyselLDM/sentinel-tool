import type { Metadata } from "next";
import Link from "next/link";
import { Download, Search } from "lucide-react";

import { fetchLogsAction } from "./actions";
import { LogsClient } from "./logs-client";

export const metadata: Metadata = {
  title: "Logs — Sentinel",
  description: "Every evaluation Sentinel has made, with scores, thresholds, and latency.",
};

/**
 * Logs Viewer page.
 *
 * Server Component: fetches the first page of logs (default sort: newest first)
 * and passes them to the interactive client component. The client component then
 * takes over all subsequent filter/page changes.
 */
export default async function LogsPage() {
  const initialResult = await fetchLogsAction({ page: 1, pageSize: 25 });

  return <LogsClient initialResult={initialResult} />;
}
