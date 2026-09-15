'use strict';

const { uuid } = require('../lib/crypto');
const inference = require('./inference.client');

/**
 * Run one evaluation and (optionally) persist it.
 *
 * `persist: false` is used by the console preview route, which is explicitly
 * not logged.
 */
async function runOnce(store, options) {
  const {
    goal,
    subtask,
    mode = 'standard',
    nliThreshold,
    contrastiveThreshold,
    requestId,
    apiKeyId = null,
    userId = null,
    userAgent = null,
    persist = true,
  } = options;

  const id = requestId || uuid();
  const started = Date.now();
  const result = await inference.evaluate({ goal, subtask, nliThreshold, contrastiveThreshold });
  const responseTimeMs = Date.now() - started;

  const record = {
    userId,
    apiKeyId,
    requestId: id,
    goal,
    subtask,
    isRejected: result.is_rejected,
    rejectionReason: result.rejection_reason,
    nliScore: result.nli.score,
    nliResult: result.nli.rejected,
    nliThreshold: result.nli.threshold,
    nliRawScores: result.nli.raw_scores || null,
    contrastiveScore: result.contrastive.score,
    contrastiveResult: result.contrastive.rejected,
    contrastiveThreshold: result.contrastive.threshold,
    responseTimeMs,
    modelVersion: result.model_version || (result.mocked ? 'mock' : 'unknown'),
    evaluationMode: mode,
    userAgent: userAgent || null,
  };

  if (persist) {
    store.requests.insert(record);
    // Best-effort metric counters (non-blocking, no failure if these throw).
    try {
      store.modelMetrics.record('nli', {
        rejected: record.nliResult,
        score: record.nliScore,
        responseTimeMs,
      });
      store.modelMetrics.record('contrastive', {
        rejected: record.contrastiveResult,
        score: record.contrastiveScore,
        responseTimeMs,
      });
    } catch {
      /* metrics are best-effort */
    }
  }

  return { id, result, record };
}

/**
 * Shape the public /api/evaluate response (spec-compatible, no envelope).
 * `result: true` == accepted; the per-model `result` is inverted from the
 * model's raw `rejected` boolean.
 */
function toPublicResponse({ id, result, mode }) {
  const base = { result: !result.is_rejected, date: new Date().toISOString(), id };
  if (mode !== 'detailed') return base;
  return {
    ...base,
    nli: {
      score: result.nli.score,
      result: !result.nli.rejected,
      threshold: result.nli.threshold,
    },
    contrastive: {
      score: result.contrastive.score,
      result: !result.contrastive.rejected,
      threshold: result.contrastive.threshold,
    },
  };
}

module.exports = { runOnce, toPublicResponse };
