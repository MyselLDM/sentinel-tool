import { apiClient } from "./client";
import type { ModelConfig, ModelMetrics } from "./types";

/**
 * Fetch read-only active model checkpoints, thresholds, and decision rules.
 * Proxied through Express from the inference service's /models endpoint.
 */
export async function getModelInfo(): Promise<ModelConfig> {
  return apiClient<ModelConfig>("/api/models");
}

/**
 * Fetch in-process live evaluation counters and model latencies.
 */
export async function getModelMetrics(): Promise<ModelMetrics> {
  return apiClient<ModelMetrics>("/api/metrics");
}
