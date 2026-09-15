'use strict';

const env = require('../config/env');
const logger = require('../lib/logger');

let cached = null;

function defaultModelInfo() {
  return {
    source: 'defaults',
    nli: {
      base: 'cross-encoder/nli-MiniLM2-L6-H768',
      version: 'unknown',
      labels: ['contradiction', 'entailment', 'neutral'],
      decision: 'p_contradiction > threshold',
      threshold: null,
    },
    contrastive: {
      base: 'all-MiniLM-L12-v2',
      version: 'unknown',
      decision: 'cosine < threshold',
      threshold: null,
    },
  };
}

/**
 * Read-only model info proxied from the inference service.
 * If it is unreachable, return the last-known payload with `stale: true`
 * (never error — the console can still render the model page).
 */
async function fetchModels() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.inferenceTimeoutMs);
  try {
    const res = await fetch(`${env.inferenceUrl}/models`, { signal: controller.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = await res.json();
    cached = json;
    return { data: json, stale: false };
  } catch (err) {
    logger.warn('models_unreachable', { error: err.message });
    return { data: cached || defaultModelInfo(), stale: true };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchModels, defaultModelInfo };
