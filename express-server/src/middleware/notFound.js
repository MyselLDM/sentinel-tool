'use strict';

const { errors } = require('../lib/errors');

/** 404 for unmatched routes (turned into the standard error envelope). */
function notFound(req, res, next) {
  next(errors.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
