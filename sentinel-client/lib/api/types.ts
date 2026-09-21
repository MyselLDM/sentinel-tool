/**
 * DTO types for Sentinel API gateway responses used across console views.
 * Contract: `express-server/API.md`.
 */

export type StatPeriod = "24h" | "7d" | "30d";

export type StatsSummary = {
  totalRequests: number;
  rejectionRate: number; // 0..1
  avgResponseTimeMs: number;
  activeKeys: number;
  period: StatPeriod;
};

export type RecentRequestItem = {
  id: string;
  requestId: string;
  createdAt: string;
  goal: string;
  subtask: string;
  isRejected: boolean;
  rejectionReason: string;
  responseTimeMs: number | null;
  modelVersion: string;
  evaluationMode: string;
};

export type NliModelDetails = {
  base: string;
  version: string;
  labels: string[];
  decision: string;
  activation?: string;
  threshold: number | null;
  threshold_source?: string;
  metrics?: Record<string, unknown>;
  resolved_source?: string;
};

export type ContrastiveModelDetails = {
  base: string;
  version: string;
  decision: string;
  include_decomposed?: boolean;
  threshold: number | null;
  threshold_source?: string;
  metrics?: Record<string, unknown>;
  resolved_source?: string;
};

export type ModelConfig = {
  source: string;
  on_base_models?: boolean;
  stale: boolean;
  generated_at?: string;
  notes?: string[];
  nli: NliModelDetails;
  contrastive: ContrastiveModelDetails;
};

export type ModelMetricItem = {
  modelType: "nli" | "contrastive";
  evaluationCount: number;
  rejectionCount: number;
  avgScore: number;
  avgResponseTimeMs: number;
  lastUpdated: string;
};

export type ModelMetrics = {
  metrics: ModelMetricItem[];
};
