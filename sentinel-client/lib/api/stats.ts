import { apiClient } from "./client";
import type { RecentRequestItem, StatPeriod, StatsSummary } from "./types";

/**
 * Fetch high-level gateway metrics (total requests, rejection rate, avg response time, active keys)
 * for the requested time window (default: '24h').
 */
export async function getStatsSummary(period: StatPeriod = "24h"): Promise<StatsSummary> {
  return apiClient<StatsSummary>("/api/stats/summary", {
    query: { period },
  });
}

/**
 * Fetch the most recent evaluation requests for the authenticated operator.
 */
export async function getRecentRequests(limit = 10): Promise<{ requests: RecentRequestItem[] }> {
  return apiClient<{ requests: RecentRequestItem[] }>("/api/stats/recent", {
    query: { limit },
  });
}
