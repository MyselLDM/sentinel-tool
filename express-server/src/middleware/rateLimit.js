'use strict';

const rl = require('express-rate-limit');
const env = require('../config/env');
const { errors } = require('../lib/errors');

// express-rate-limit v7/v8 export surface varies; normalize it.
const rateLimit = rl.rateLimit || rl;
const ipKeyGenerator = rl.ipKeyGenerator || ((ip) => (ip == null ? 'unknown' : String(ip)));

function handler(req, res, next) {
  next(errors.rateLimited());
}

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
};

/** Per-API-key limit for /api/evaluate (falls back to the global default). */
function perApiKey() {
  return rateLimit({
    ...base,
    windowMs: 60_000,
    limit: (req) => (req.apiKey && req.apiKey.rateLimitPerMinute) || env.rateLimitDefaultPerMinute,
    keyGenerator: (req) => (req.apiKey ? `key:${req.apiKey.id}` : `ip:${ipKeyGenerator(req.ip)}`),
  });
}

/** Stricter per-IP limit for auth endpoints (credential-stuffing defence). */
function perIp({ limit = 10, windowMs = 60_000 } = {}) {
  return rateLimit({
    ...base,
    windowMs,
    limit,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
  });
}

/** Generous per-user limit for the console read endpoints. */
function perUser({ limit = 600, windowMs = 60_000 } = {}) {
  return rateLimit({
    ...base,
    windowMs,
    limit,
    keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
  });
}

module.exports = { perApiKey, perIp, perUser };
