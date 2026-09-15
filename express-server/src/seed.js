'use strict';

const { hashPassword } = require('./lib/password');
const keysService = require('./services/keys.service');
const logger = require('./lib/logger');

const DEMO_EMAIL = 'demo@sentinel.local';
const DEMO_PASSWORD = 'demo-password-123';

/**
 * Development convenience: create a demo operator and one API key, and log the
 * credentials so the API can be exercised immediately. Never for production.
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

  const { key } = keysService.create(store, user.id, {
    keyName: 'dev-seed-key',
    rateLimitPerMinute: 120,
  });

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
