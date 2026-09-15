'use strict';

const logger = require('../lib/logger');

/**
 * Structured access log. Deliberately logs only metadata (never headers,
 * bodies, tokens or API keys) to keep secrets out of the logs.
 */
function accessLog(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info('request', {
      id: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.user ? req.user.id : undefined,
      apiKeyId: req.apiKey ? req.apiKey.id : undefined,
    });
  });
  next();
}

module.exports = accessLog;
