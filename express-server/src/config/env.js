'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

// Load express-server/.env if present (Node >= 20.12). No dotenv dependency.
try {
  process.loadEnvFile(path.resolve(__dirname, '..', '..', '.env'));
} catch {
  /* no .env file — rely on the ambient environment */
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toList(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

let jwtSecret = process.env.JWT_SECRET;
let ephemeralSecret = false;
if (!jwtSecret) {
  if (isProd) {
    throw new Error('JWT_SECRET is required when NODE_ENV=production');
  }
  jwtSecret = crypto.randomBytes(32).toString('hex');
  ephemeralSecret = true;
}

const env = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  ephemeralSecret,

  port: toInt(process.env.PORT, 4000),
  corsOrigins: toList(process.env.CORS_ORIGINS, ['http://localhost:3000']),

  jwtSecret,
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '1h',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || '7d',

  inferenceUrl: (process.env.INFERENCE_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  inferenceTimeoutMs: toInt(process.env.INFERENCE_TIMEOUT_MS, 5000),
  inferenceMock: toBool(process.env.INFERENCE_MOCK, false),
  inferenceMockFallback: toBool(process.env.INFERENCE_MOCK_FALLBACK, false),

  apiKeyPrefix: process.env.API_KEY_PREFIX || (isProd ? 'sk_live_' : 'sk_test_'),
  rateLimitDefaultPerMinute: toInt(process.env.RATE_LIMIT_DEFAULT_PER_MIN, 60),

  /**
   * SQLite database file. Defaults to `<express-server>/data/sentinel.db`.
   * Use `:memory:` for an ephemeral store (tests).
   */
  dbPath: process.env.DB_PATH
    ? process.env.DB_PATH
    : path.resolve(__dirname, '..', '..', 'data', 'sentinel.db'),

  seedDemo: toBool(process.env.SEED_DEMO, !isProd),
  /** When set, the dev seed issues this exact key so it stays stable across restarts. */
  seedDemoApiKey: process.env.SEED_DEMO_API_KEY || null,
};

module.exports = env;
