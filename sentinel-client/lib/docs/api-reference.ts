/**
 * Structured reference for the Sentinel gateway's HTTP API.
 *
 * Kept as data (not JSX) so the docs page and its table of contents render from
 * one source. Mirrors `express-server/API.md` — keep the two in step.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiParam = {
  name: string;
  type: string;
  notes: string;
};

export type ApiEndpoint = {
  /** Anchor id / ToC entry. */
  id: string;
  method: HttpMethod;
  path: string;
  auth: string;
  summary: string;
  params?: ApiParam[];
  request?: string;
  response?: string;
  errors?: string;
  note?: string;
};

export type ApiGroup = {
  id: string;
  title: string;
  blurb: string;
  endpoints: ApiEndpoint[];
};

export const API_BASE_URL = "http://localhost:4000";

export const API_GROUPS: readonly ApiGroup[] = [
  {
    id: "health",
    title: "Health",
    blurb: "Liveness and readiness probes. No auth.",
    endpoints: [
      {
        id: "healthz",
        method: "GET",
        path: "/healthz",
        auth: "None",
        summary: "Liveness — always 200 while the process is up.",
        response: `{ "status": "ok", "uptimeSeconds": 42 }`,
      },
      {
        id: "readyz",
        method: "GET",
        path: "/readyz",
        auth: "None",
        summary: "Readiness — checks the store and the inference service.",
        response: `// 200
{ "status": "ok", "dependencies": { "store": "up", "inference": "up" } }
// 503 (inference unreachable)
{ "status": "degraded", "dependencies": { "store": "up", "inference": "down" } }`,
        note: '`inference` reads `"mocked"` when the gateway runs with `INFERENCE_MOCK=true`.',
      },
    ],
  },
  {
    id: "auth",
    title: "Authentication",
    blurb:
      "Operator accounts. These are called by the console, not by agents — agents use an API key on `POST /api/evaluate`.",
    endpoints: [
      {
        id: "register",
        method: "POST",
        path: "/api/auth/register",
        auth: "None",
        summary: "Create an account and receive a token pair. Rate limited per IP.",
        request: `{ "email": "op@acme.io", "password": "correct horse battery", "fullName": "Op" }`,
        response: `// 201
{ "data": { "user": { /* User */ }, "accessToken": "eyJ…", "refreshToken": "eyJ…" } }`,
        params: [
          { name: "email", type: "string", notes: "Valid email address." },
          { name: "password", type: "string", notes: "At least 12 characters." },
          { name: "fullName", type: "string?", notes: "Optional, ≤ 100 chars." },
        ],
        errors: "`400 VALIDATION_ERROR` · `409 CONFLICT` (email taken) · `429 RATE_LIMITED`",
      },
      {
        id: "login",
        method: "POST",
        path: "/api/auth/login",
        auth: "None",
        summary: "Exchange email + password for a token pair.",
        request: `{ "email": "op@acme.io", "password": "correct horse battery" }`,
        response: `// 200
{ "data": { "user": { /* User */ }, "accessToken": "…", "refreshToken": "…" } }`,
        errors: "`400 VALIDATION_ERROR` · `401 INVALID_CREDENTIALS` · `429 RATE_LIMITED`",
      },
      {
        id: "refresh",
        method: "POST",
        path: "/api/auth/refresh",
        auth: "Refresh token",
        summary: "Rotate the token pair. The presented refresh token is revoked.",
        request: `{ "refreshToken": "eyJ…" }`,
        response: `// 200
{ "data": { "user": { /* User */ }, "accessToken": "…", "refreshToken": "…" } }`,
        errors: "`400 VALIDATION_ERROR` · `401 UNAUTHORIZED` (invalid, expired or reused token)",
      },
      {
        id: "me",
        method: "GET",
        path: "/api/auth/me",
        auth: "Access JWT",
        summary: "The operator behind the access token.",
        response: `{ "data": { "user": { /* User */ } } }`,
      },
      {
        id: "logout",
        method: "POST",
        path: "/api/auth/logout",
        auth: "Access JWT",
        summary: "Revoke the supplied refresh token. Idempotent.",
        request: `{ "refreshToken": "eyJ…" }   // optional`,
        response: `{ "data": { "revoked": 1 } }   // 0 if nothing was revoked`,
      },
    ],
  },
  {
    id: "keys",
    title: "API keys",
    blurb: "Issue and manage the credentials agents authenticate with. Scoped to the calling operator.",
    endpoints: [
      {
        id: "createKey",
        method: "POST",
        path: "/api/keys",
        auth: "Access JWT",
        summary: "Create a key. The plaintext secret is returned **exactly once**.",
        request: `{
  "keyName": "Thesis eval key",          // required, 1–100 chars
  "rateLimitPerMinute": 60,              // optional, 1–10000
  "expiresAt": "2026-12-31T00:00:00Z"    // optional, future ISO date; null = never
}`,
        response: `// 201
{ "data": { "key": "sk_test_8f3a…b1c9", "record": { /* ApiKey */ } } }`,
        errors: "`400 VALIDATION_ERROR` · `401 UNAUTHORIZED`",
        note: "Store the `key` immediately — it cannot be retrieved again.",
      },
      {
        id: "listKeys",
        method: "GET",
        path: "/api/keys",
        auth: "Access JWT",
        summary: "List keys, masked.",
        response: `{ "data": { "keys": [ /* ApiKey */ ] } }`,
      },
      {
        id: "getKey",
        method: "GET",
        path: "/api/keys/:id",
        auth: "Access JWT",
        summary: "One key (masked).",
        response: `{ "data": { "key": { /* ApiKey */ } } }`,
        errors: "`400 VALIDATION_ERROR` (id not a UUID) · `404 NOT_FOUND`",
      },
      {
        id: "updateKey",
        method: "PATCH",
        path: "/api/keys/:id",
        auth: "Access JWT",
        summary: "Activate, deactivate or rename a key.",
        request: `{ "isActive": false }
{ "keyName": "new name" }`,
        response: `{ "data": { "key": { /* ApiKey */ } } }`,
        errors: "`400 VALIDATION_ERROR` · `404 NOT_FOUND`",
      },
      {
        id: "deleteKey",
        method: "DELETE",
        path: "/api/keys/:id",
        auth: "Access JWT",
        summary: "Hard-delete a key so its hash can never authenticate again.",
        response: `{ "data": { "id": "uuid", "deleted": true } }`,
        errors: "`400 VALIDATION_ERROR` · `404 NOT_FOUND`",
      },
    ],
  },
  {
    id: "evaluate",
    title: "Evaluation",
    blurb: "The gate itself. `POST /api/evaluate` is the one endpoint agents call.",
    endpoints: [
      {
        id: "postEvaluate",
        method: "POST",
        path: "/api/evaluate",
        auth: "API key",
        summary:
          "Score a goal/subtask pair. Rejected if **either** model rejects. Returns the spec's flat shape (no envelope).",
        request: `{
  "goal": "Process disability benefits for veteran",   // required, 1–2000 chars
  "subtask": "Retrieve medical records",                // required, 1–2000 chars
  "mode": "standard"                                    // "standard" | "detailed"
}`,
        response: `// 200 — standard
{ "result": true, "date": "2026-01-01T12:00:00.000Z", "id": "<requestId>" }

// 200 — detailed
{
  "result": true,
  "date": "2026-01-01T12:00:00.000Z",
  "id": "<requestId>",
  "nli":         { "score": 0.12, "result": true, "threshold": 0.5 },
  "contrastive": { "score": 0.81, "result": true, "threshold": 0.5 }
}`,
        errors:
          "`400 VALIDATION_ERROR` · `401 UNAUTHORIZED` (bad key) · `403 FORBIDDEN` (inactive/expired key) · `429 RATE_LIMITED` · `503 INFERENCE_UNAVAILABLE`",
        note: "`result: true` = **accepted**. `nli.score` is `p(contradiction)` (higher = more malicious); `contrastive.score` is cosine similarity (lower = more malicious). Both per-model `result` fields use the same “true = accepted” convention.",
      },
      {
        id: "evaluatePreview",
        method: "POST",
        path: "/api/evaluate/preview",
        auth: "Access JWT",
        summary:
          "Run the models on an ad-hoc pair with a threshold override — no API key consumed, not persisted to the logs.",
        request: `{
  "goal": "…", "subtask": "…", "mode": "standard",
  "nliThreshold": 0.62,           // optional, (0,1)
  "contrastiveThreshold": 0.58    // optional, (0,1)
}`,
        response: `{ "data": {
  "id": "uuid", "result": true, "isRejected": false, "rejectionReason": "accepted",
  "date": "…", "modelVersion": "nli=…;con=…", "responseTimeMs": 88,
  "nli":         { "score": 0.12, "rejected": false, "threshold": 0.62,
                   "rawScores": { "contradiction": 0.12, "entailment": 0.85, "neutral": 0.03 } },
  "contrastive": { "score": 0.81, "rejected": false, "threshold": 0.58 }
} }`,
        note: "Console-only and experimental. Note the per-model field here is `rejected` (true = the model rejected) — the inverse of the public endpoint's `result`.",
      },
    ],
  },
  {
    id: "logs",
    title: "Logs",
    blurb: "Every evaluation the operator's keys have made.",
    endpoints: [
      {
        id: "listRequests",
        method: "GET",
        path: "/api/requests",
        auth: "Access JWT",
        summary: "Filterable, paginated list of evaluations.",
        params: [
          { name: "from / to", type: "ISO date", notes: "`createdAt` range (`from <= to`)." },
          { name: "status", type: "accepted | rejected", notes: "Maps to `isRejected`." },
          { name: "q", type: "string", notes: "Substring match on `requestId`." },
          { name: "mode", type: "standard | detailed", notes: "Match `evaluationMode`." },
          { name: "page", type: "int ≥ 1", notes: "Default `1`." },
          { name: "pageSize", type: "int 1–100", notes: "Default `25`." },
          { name: "sort", type: "created_at | response_time_ms", notes: "Descending. Default `created_at`." },
        ],
        response: `{
  "data": { "requests": [ /* RequestListItem */ ] },
  "meta": { "page": 1, "pageSize": 25, "total": 1284, "totalPages": 52 }
}`,
        errors: "`400 VALIDATION_ERROR` · `401 UNAUTHORIZED`",
      },
      {
        id: "getRequest",
        method: "GET",
        path: "/api/requests/:requestId",
        auth: "Access JWT",
        summary: "Full detail for a single evaluation.",
        response: `{ "data": { "request": {
  "id": "uuid", "requestId": "uuid", "createdAt": "…",
  "goal": "…", "subtask": "…",
  "isRejected": false, "rejectionReason": "accepted",
  "nli":         { "score": 0.12, "result": false, "threshold": 0.5,
                   "rawScores": { "contradiction": 0.12, "entailment": 0.85, "neutral": 0.03 } },
  "contrastive": { "score": 0.81, "result": false, "threshold": 0.5 },
  "responseTimeMs": 88, "modelVersion": "…", "evaluationMode": "detailed",
  "userAgent": "curl/8.0", "apiKeyId": "uuid"
} } }`,
        errors: "`401 UNAUTHORIZED` · `404 NOT_FOUND`",
      },
      {
        id: "exportRequests",
        method: "GET",
        path: "/api/requests/export.csv",
        auth: "Access JWT",
        summary: "CSV export honouring the same filters (pagination ignored).",
        response: `Content-Type: text/csv
Content-Disposition: attachment; filename="evaluation_requests.csv"

request_id, created_at, goal, subtask, is_rejected, rejection_reason,
nli_score, nli_threshold, nli_result, contrastive_score, contrastive_threshold,
contrastive_result, response_time_ms, model_version, evaluation_mode`,
      },
    ],
  },
  {
    id: "stats",
    title: "Stats",
    blurb: "Headline numbers for the dashboard.",
    endpoints: [
      {
        id: "statsSummary",
        method: "GET",
        path: "/api/stats/summary",
        auth: "Access JWT",
        summary: "Totals for a period.",
        params: [{ name: "period", type: "24h | 7d | 30d", notes: "Default `24h`." }],
        response: `{ "data": {
  "totalRequests": 1284, "rejectionRate": 0.17, "avgResponseTimeMs": 142,
  "activeKeys": 3, "period": "24h"
} }`,
      },
      {
        id: "statsRecent",
        method: "GET",
        path: "/api/stats/recent",
        auth: "Access JWT",
        summary: "Newest evaluations, for the activity feed.",
        params: [{ name: "limit", type: "int 1–100", notes: "Default `10`." }],
        response: `{ "data": { "requests": [ /* RequestListItem */ ] } }`,
      },
    ],
  },
  {
    id: "models",
    title: "Models & metrics",
    blurb: "Read-only model info and in-process counters.",
    endpoints: [
      {
        id: "getModels",
        method: "GET",
        path: "/api/models",
        auth: "Access JWT",
        summary:
          "Model versions, decision rules and trained thresholds, proxied from the inference service. Never errors — falls back to the last-known payload with `stale: true`.",
        response: `{ "data": {
  "source": "model_config.json", "stale": false,
  "nli": {
    "base": "cross-encoder/nli-MiniLM2-L6-H768",
    "version": "sentinelagent-nli-3class-v1",
    "labels": ["contradiction", "entailment", "neutral"],
    "decision": "p_contradiction > threshold", "threshold": 0.5,
    "threshold_source": "placeholder"
  },
  "contrastive": {
    "base": "all-MiniLM-L12-v2",
    "decision": "cosine < threshold", "threshold": 0.5
  }
} }`,
        note: "Thresholds are training artifacts, not operator settings — they are read-only here and tuned during training.",
      },
      {
        id: "getMetrics",
        method: "GET",
        path: "/api/metrics",
        auth: "Access JWT",
        summary: "Per-model counters, updated on each evaluation.",
        response: `{ "data": { "metrics": [
  { "modelType": "nli", "evaluationCount": 12, "rejectionCount": 4,
    "avgScore": 0.31, "avgResponseTimeMs": 41, "lastUpdated": "…" },
  { "modelType": "contrastive", "evaluationCount": 12, "rejectionCount": 5,
    "avgScore": 0.62, "avgResponseTimeMs": 41, "lastUpdated": "…" }
] } }`,
      },
    ],
  },
] as const;

/** Shared object shapes, rendered once at the top of the reference. */
export const API_SHAPES: readonly { name: string; body: string }[] = [
  {
    name: "User",
    body: `{ "id": "uuid", "email": "op@acme.io", "fullName": "Op",
  "isAdmin": false, "createdAt": "2026-01-01T00:00:00.000Z" }`,
  },
  {
    name: "ApiKey (masked — never contains the secret)",
    body: `{ "id": "uuid", "keyName": "Thesis eval key", "prefix": "sk_test_8f3a",
  "last4": "b1c9", "isActive": true, "rateLimitPerMinute": 60,
  "createdAt": "2026-01-01T00:00:00.000Z", "expiresAt": null, "lastUsedAt": null }`,
  },
  {
    name: "RequestListItem",
    body: `{ "id": "uuid", "requestId": "uuid", "createdAt": "2026-01-01T00:00:00.000Z",
  "goal": "…", "subtask": "…", "isRejected": false, "rejectionReason": "accepted",
  "responseTimeMs": 88, "modelVersion": "nli=…;con=…", "evaluationMode": "standard" }`,
  },
];

export const ERROR_CODES: readonly { status: string; code: string; meaning: string }[] = [
  { status: "400", code: "VALIDATION_ERROR", meaning: "Body/query/params failed validation (`details` lists fields)." },
  { status: "401", code: "UNAUTHORIZED", meaning: "Missing or invalid credentials." },
  { status: "401", code: "INVALID_CREDENTIALS", meaning: "Wrong email/password on login." },
  { status: "403", code: "FORBIDDEN", meaning: "Authenticated but not allowed (inactive/expired API key)." },
  { status: "404", code: "NOT_FOUND", meaning: "Resource missing, or not owned by you." },
  { status: "409", code: "CONFLICT", meaning: "e.g. email already registered." },
  { status: "429", code: "RATE_LIMITED", meaning: "Too many requests." },
  { status: "500", code: "INTERNAL", meaning: "Unexpected error." },
  { status: "503", code: "INFERENCE_UNAVAILABLE", meaning: "The inference service is unreachable." },
  { status: "503", code: "INFERENCE_BAD_RESPONSE", meaning: "The inference service returned an unexpected payload." },
];

/** Total endpoint count, for the page subtitle. */
export const ENDPOINT_COUNT = API_GROUPS.reduce((n, g) => n + g.endpoints.length, 0);
