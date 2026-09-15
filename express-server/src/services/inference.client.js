'use strict';

const crypto = require('node:crypto');
const { z } = require('zod');

const env = require('../config/env');
const logger = require('../lib/logger');
const { AppError, errors } = require('../lib/errors');

/**
 * Client for the FastAPI inference service.
 *
 * Contract (see fastapi/README.md and express-server/plan.md §12):
 *   POST {INFERENCE_URL}/evaluate  { goal, subtask, nli_threshold?, contrastive_threshold? }
 *   -> { nli:{score,threshold,rejected,margin,raw_scores,latency_ms},
 *        contrastive:{score,threshold,rejected,margin,latency_ms},
 *        is_rejected, rejection_reason, model_version }
 *
 * When the service is down (or INFERENCE_MOCK=true) deterministic mock scores
 * are produced so the rest of the stack can be built and tested.
 */

const nliSchema = z.object({
  score: z.number(),
  threshold: z.number(),
  rejected: z.boolean(),
  margin: z.number().optional(),
  raw_scores: z.record(z.string(), z.number()).optional(),
  latency_ms: z.number().optional(),
});

const contrastiveSchema = z.object({
  score: z.number(),
  threshold: z.number(),
  rejected: z.boolean(),
  margin: z.number().optional(),
  latency_ms: z.number().optional(),
});

const inferenceResponseSchema = z.object({
  nli: nliSchema,
  contrastive: contrastiveSchema,
  is_rejected: z.boolean(),
  rejection_reason: z.string(),
  model_version: z.string().optional(),
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function unitFromHash(text) {
  const digest = crypto.createHash('sha256').update(text).digest();
  // first 6 bytes -> [0, 1)
  return digest.readUIntBE(0, 6) / 0x1000000000000;
}

/** Deterministic, explainable mock inference (same input ⇒ same output). */
function mockEvaluate({ goal, subtask, nliThreshold, contrastiveThreshold }) {
  const u = unitFromHash(`${goal}|${subtask}`); // maliciousness proxy
  const v = unitFromHash(`${subtask}|${goal}`);
  const nliThresholdValue = nliThreshold ?? 0.5;
  const contrastiveThresholdValue = contrastiveThreshold ?? 0.5;

  const contradiction = u;
  const entailment = (1 - u) * v;
  const neutral = (1 - u) * (1 - v);

  const nliScore = contradiction;
  const nliRejected = nliScore > nliThresholdValue;

  const cosine = 1 - 2 * u; // high maliciousness -> low similarity
  const contrastiveRejected = cosine < contrastiveThresholdValue;

  const reasons = [];
  if (nliRejected) reasons.push('nli_reject');
  if (contrastiveRejected) reasons.push('contrastive_reject');

  return {
    nli: {
      score: nliScore,
      threshold: nliThresholdValue,
      rejected: nliRejected,
      raw_scores: { contradiction, entailment, neutral },
    },
    contrastive: {
      score: cosine,
      threshold: contrastiveThresholdValue,
      rejected: contrastiveRejected,
    },
    is_rejected: nliRejected || contrastiveRejected,
    rejection_reason: reasons.length === 2 ? 'both_reject' : reasons[0] || 'accepted',
    model_version: 'mock',
    mocked: true,
  };
}

async function fetchOnce(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.inferenceTimeoutMs);
  try {
    const res = await fetch(`${env.inferenceUrl}/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (res.status >= 500) {
      const err = new Error(`inference responded ${res.status}`);
      err.retryable = true;
      throw err;
    }
    if (!res.ok) {
      throw errors.inferenceBadResponse(`Inference service rejected the request (${res.status})`);
    }

    const json = await res.json();
    const parsed = inferenceResponseSchema.safeParse(json);
    if (!parsed.success) {
      logger.warn('inference_bad_response', { issues: parsed.error.issues.map((i) => i.path.join('.')) });
      throw errors.inferenceBadResponse();
    }
    return { ...parsed.data, mocked: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run an evaluation. Honors INFERENCE_MOCK / INFERENCE_MOCK_FALLBACK.
 * Throws AppError('INFERENCE_UNAVAILABLE'|'INFERENCE_BAD_RESPONSE') on failure.
 */
async function evaluate(payload) {
  if (env.inferenceMock) return mockEvaluate(payload);

  let lastErr;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      return await fetchOnce(payload);
    } catch (err) {
      lastErr = err;
      if (err instanceof AppError && err.code === 'INFERENCE_BAD_RESPONSE') break;
      if (attempt === 0) await sleep(200);
    }
  }

  if (env.inferenceMockFallback) {
    logger.warn('inference_fallback_to_mock', { error: lastErr && lastErr.message });
    return mockEvaluate(payload);
  }

  throw lastErr instanceof AppError
    ? lastErr
    : errors.inferenceUnavailable(`Could not reach the inference service at ${env.inferenceUrl}`);
}

/** Quick reachability probe used by /readyz. */
async function ping(timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.inferenceUrl}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { evaluate, ping, mockEvaluate, inferenceResponseSchema };
