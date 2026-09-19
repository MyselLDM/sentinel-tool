'use strict';

const env = require('./config/env');
const { hashPassword } = require('./lib/password');
const { deriveApiKey } = require('./lib/crypto');
const keysService = require('./services/keys.service');
const logger = require('./lib/logger');

const DEMO_EMAIL = 'demo@sentinel.local';
const DEMO_PASSWORD = 'demo-password-123';
const DEMO_KEY_NAME = 'dev-seed-key';

/**
 * Development convenience: create a demo operator and one API key, and log the
 * credentials so the API can be exercised immediately. Never for production.
 *
 * Idempotent: the store now persists, so a second startup reuses the existing
 * demo user/key instead of piling up duplicates.
 */
function seedDemo(store) {
  let user = store.users.findByEmail(DEMO_EMAIL);
  if (!user) {
    user = store.users.create({
      email: DEMO_EMAIL,
      passwordHash: hashPassword(DEMO_PASSWORD),
      fullName: 'Demo Operator',
    });
  }

  // Reuse an already-seeded key so restarts stay stable.
  if (env.seedDemoApiKey) {
    // The pinned key is known in full, so we can both detect and re-log it.
    const { hash } = deriveApiKey(env.seedDemoApiKey);
    if (store.apiKeys.findByHash(hash)) {
      logger.info('demo_seed_reused', {
        note: 'SEED_DEMO_API_KEY already seeded — reusing it',
        email: DEMO_EMAIL,
        apiKey: env.seedDemoApiKey,
      });
      return { user, apiKey: env.seedDemoApiKey };
    }
  } else {
    const existing = store.apiKeys
      .listByUser(user.id)
      .find((k) => k.keyName === DEMO_KEY_NAME && k.isActive);
    if (existing) {
      logger.info('demo_seed_key_exists', {
        note: 'demo API key already seeded (plaintext is not recoverable) — set SEED_DEMO_API_KEY to pin it, or delete the database to reseed',
        email: DEMO_EMAIL,
        keyName: DEMO_KEY_NAME,
      });
      return { user, apiKey: null };
    }
  }

  const { key } = keysService.create(
    store,
    user.id,
    { keyName: DEMO_KEY_NAME, rateLimitPerMinute: 120 },
    // SEED_DEMO_API_KEY pins the value so the console/playground config is stable.
    env.seedDemoApiKey ? { plaintext: env.seedDemoApiKey } : undefined,
  );

  logger.warn('demo_seed_created', {
    note: 'DEVELOPMENT seed — do not use in production (set SEED_DEMO=false to disable)',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    apiKey: key,
    hint: `curl -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '{"goal":"...","subtask":"..."}' http://localhost:${process.env.PORT || 4000}/api/evaluate`,
  });

  return { user, apiKey: key };
}

module.exports = { seedDemo, DEMO_EMAIL, DEMO_PASSWORD };
