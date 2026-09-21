const BASE_URL = (process.env.SENTINEL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export type RequestFilters = {
  from?: string;
  to?: string;
  status?: "accepted" | "rejected";
  q?: string;
  mode?: "standard" | "detailed";
  page?: number;
  pageSize?: number;
  sort?: "created_at" | "response_time_ms";
};

export type RequestListItem = {
  id: string;
  requestId: string;
  createdAt: string;
  goal: string;
  subtask: string;
  isRejected: boolean;
  rejectionReason: string | null;
  nliScore: number | null;
  nliThreshold: number | null;
  nliResult: boolean | null;
  contrastiveScore: number | null;
  contrastiveThreshold: number | null;
  contrastiveResult: boolean | null;
  responseTimeMs: number | null;
  modelVersion: string | null;
  evaluationMode: string | null;
};

export type RequestDetail = {
  id: string;
  requestId: string;
  createdAt: string;
  goal: string;
  subtask: string;
  isRejected: boolean;
  rejectionReason: string | null;
  nli: {
    score: number | null;
    result: boolean | null;
    threshold: number | null;
    rawScores: Record<string, number> | null;
  };
  contrastive: {
    score: number | null;
    result: boolean | null;
    threshold: number | null;
  };
  responseTimeMs: number | null;
  modelVersion: string | null;
  evaluationMode: string | null;
  userAgent: string | null;
  apiKeyId: string | null;
};

export type RequestListEnvelope = {
  data: { requests: RequestListItem[] };
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type RequestDetailEnvelope = {
  data: { request: RequestDetail };
};

function toQueryString(filters: RequestFilters): string {
  const params = new URLSearchParams();
  const entries: Array<[string, string]> = [];

  if (filters.from) entries.push(["from", filters.from]);
  if (filters.to) entries.push(["to", filters.to]);
  if (filters.status) entries.push(["status", filters.status]);
  if (filters.q) entries.push(["q", filters.q]);
  if (filters.mode) entries.push(["mode", filters.mode]);
  if (filters.page) entries.push(["page", String(filters.page)]);
  if (filters.pageSize) entries.push(["pageSize", String(filters.pageSize)]);
  if (filters.sort) entries.push(["sort", filters.sort]);

  for (const [key, value] of entries) params.set(key, value);
  return params.toString();
}

async function fetchJson<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string; code?: string }; meta?: unknown }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Gateway request failed (${response.status}).`);
  }

  if (!payload || payload.data === undefined) {
    throw new Error("The gateway returned an unexpected response.");
  }

  return payload.data as T;
}

export async function listRequests(
  accessToken: string,
  filters: RequestFilters = {},
): Promise<RequestListEnvelope> {
  const query = toQueryString(filters);
  const response = await fetch(`${BASE_URL}/api/requests${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: { requests: RequestListItem[] }; meta?: RequestListEnvelope["meta"]; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Gateway request failed (${response.status}).`);
  }

  if (!payload || !payload.data || !payload.meta) {
    throw new Error("The gateway returned an unexpected response.");
  }

  return {
    data: { requests: payload.data.requests },
    meta: payload.meta,
  };
}

export async function getRequest(accessToken: string, requestId: string): Promise<RequestDetail> {
  const payload = await fetchJson<{ request: RequestDetail }>(`/api/requests/${encodeURIComponent(requestId)}`, accessToken);
  return payload.request;
}
