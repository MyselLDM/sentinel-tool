'use strict';

const { randomUUID } = require('node:crypto');

/** Attach/propagate a request id (echoed as X-Request-Id). */
function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && incoming.length <= 100 ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
