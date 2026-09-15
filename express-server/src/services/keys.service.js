'use strict';

const env = require('../config/env');
const { generateApiKey } = require('../lib/crypto');
const { errors } = require('../lib/errors');

/** Public (masked) shape of an API key record — never contains the secret. */
function publicKey(row) {
  return {
    id: row.id,
    keyName: row.keyName,
    prefix: row.apiKeyPrefix,
    last4: row.last4,
    isActive: row.isActive,
    rateLimitPerMinute: row.rateLimitPerMinute,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/** Create a key. The plaintext secret is returned here exactly once. */
function create(store, userId, { keyName, rateLimitPerMinute, expiresAt }) {
  const generated = generateApiKey();
  const row = store.apiKeys.create({
    userId,
    keyName,
    apiKeyHash: generated.hash,
    apiKeyPrefix: generated.prefix,
    last4: generated.last4,
    rateLimitPerMinute: rateLimitPerMinute ?? env.rateLimitDefaultPerMinute,
    expiresAt: expiresAt ?? null,
  });
  return { key: generated.plaintext, record: publicKey(row) };
}

function list(store, userId) {
  return store.apiKeys.listByUser(userId).map(publicKey);
}

function getOwned(store, userId, id) {
  const row = store.apiKeys.findByIdForUser(id, userId);
  if (!row) throw errors.notFound('API key not found');
  return row;
}

function get(store, userId, id) {
  return publicKey(getOwned(store, userId, id));
}

function update(store, userId, id, patch) {
  const row = getOwned(store, userId, id);
  const updated = store.apiKeys.update(row.id, patch);
  return publicKey(updated);
}

/** Hard delete (free the hash so it can never authenticate again). */
function remove(store, userId, id) {
  const row = getOwned(store, userId, id);
  store.apiKeys.remove(row.id);
  return { id: row.id, deleted: true };
}

module.exports = { create, list, get, update, remove, publicKey };
