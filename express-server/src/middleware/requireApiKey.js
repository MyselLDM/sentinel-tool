'use strict';

const { hashApiKey } = require('../lib/crypto');
const { errors } = require('../lib/errors');

function extractKey(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer' && token) return token;

  const xApiKey = req.get('x-api-key');
  return xApiKey || null;
}

/**
 * Authenticate a data-plane request via an API key
 * (Authorization: Bearer sk_...  or  x-api-key: sk_...).
 */
function requireApiKey(store) {
  return (req, res, next) => {
    const secret = extractKey(req);
    if (!secret) return next(errors.unauthorized('Missing API key'));

    const row = store.apiKeys.findByHash(hashApiKey(secret));
    if (!row) return next(errors.unauthorized('Invalid API key'));
    if (!row.isActive) return next(errors.forbidden('API key is inactive'));
    if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) {
      return next(errors.forbidden('API key has expired'));
    }

    req.apiKey = {
      id: row.id,
      userId: row.userId,
      keyName: row.keyName,
      rateLimitPerMinute: row.rateLimitPerMinute,
    };

    store.apiKeys.touchLastUsed(row.id);
    return next();
  };
}

module.exports = requireApiKey;
module.exports.extractKey = extractKey;
