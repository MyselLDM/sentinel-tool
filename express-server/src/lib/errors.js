'use strict';

/** Error codes and their HTTP status (see plan §15.3). */
const CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  INFERENCE_UNAVAILABLE: 503,
  INFERENCE_BAD_RESPONSE: 503,
};

class AppError extends Error {
  constructor(code, message, details) {
    const status = CODES[code] || 500;
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    /** Only expose the message to clients for 4xx errors. */
    this.expose = status < 500;
  }
}

const errors = {
  validation: (message = 'Invalid request', details) =>
    new AppError('VALIDATION_ERROR', message, details),
  unauthorized: (message = 'Authentication required') =>
    new AppError('UNAUTHORIZED', message),
  invalidCredentials: (message = 'Invalid email or password') =>
    new AppError('INVALID_CREDENTIALS', message),
  forbidden: (message = 'Forbidden', details) =>
    new AppError('FORBIDDEN', message, details),
  notFound: (message = 'Not found', details) =>
    new AppError('NOT_FOUND', message, details),
  conflict: (message = 'Conflict', details) =>
    new AppError('CONFLICT', message, details),
  rateLimited: (message = 'Too many requests') =>
    new AppError('RATE_LIMITED', message),
  inferenceUnavailable: (message = 'Inference service unavailable') =>
    new AppError('INFERENCE_UNAVAILABLE', message),
  inferenceBadResponse: (message = 'Inference service returned an invalid response') =>
    new AppError('INFERENCE_BAD_RESPONSE', message),
  internal: (message = 'Internal server error') => new AppError('INTERNAL', message),
};

module.exports = { AppError, CODES, errors };
