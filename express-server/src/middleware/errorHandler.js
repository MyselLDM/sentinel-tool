'use strict';

const { AppError } = require('../lib/errors');
const logger = require('../lib/logger');
const env = require('../config/env');

/* eslint-disable-next-line no-unused-vars */
function errorHandler(err, req, res, next) {
  const isApp = err instanceof AppError;
  const status = isApp ? err.status : 500;
  const code = isApp ? err.code : 'INTERNAL';

  if (status >= 500) {
    logger.error('request_failed', {
      id: req.id,
      code,
      status,
      message: err.message,
      stack: env.isProd ? undefined : err.stack,
    });
  }

  const message =
    isApp && err.expose ? err.message : status >= 500 ? 'Internal server error' : err.message;

  const body = { error: { code, message } };
  if (isApp && err.details) body.error.details = err.details;

  if (res.headersSent) return;
  res.status(status).json(body);
}

module.exports = errorHandler;
