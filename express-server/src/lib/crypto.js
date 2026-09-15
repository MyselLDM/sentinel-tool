'use strict';

const crypto = require('node:crypto');
const env = require('../config/env');

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Cryptographically-random base62 string of the given length. */
function randomBase62(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += BASE62[bytes[i] % BASE62.length];
  }
  return out;
}

/** sha256 hex digest of an API key (only the hash is ever stored). */
function hashApiKey(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Generate a new API key.
 * Returns { plaintext, prefix, last4, hash } — `plaintext` is shown once only.
 */
function generateApiKey() {
  const plaintext = env.apiKeyPrefix + randomBase62(32);
  return {
    plaintext,
    prefix: plaintext.slice(0, env.apiKeyPrefix.length + 4),
    last4: plaintext.slice(-4),
    hash: hashApiKey(plaintext),
  };
}

function uuid() {
  return crypto.randomUUID();
}

module.exports = { randomBase62, hashApiKey, generateApiKey, uuid };
