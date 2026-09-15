'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const env = require('./config/env');
const { createStore } = require('./store');
const requestId = require('./middleware/requestId');
const accessLog = require('./middleware/logger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const mountRoutes = require('./routes');

/**
 * Build the Express app (no listen — see server.js). Exposed separately so it
 * can be instantiated in tests.
 */
function createApp({ store = createStore() } = {}) {
  const app = express();

  app.disable('x-powered-by');
  if (env.isProd) app.set('trust proxy', 1);

  app.locals.store = store;

  // ── Global middleware (see plan §6) ──
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestId);
  app.use(accessLog);

  // ── Routes ──
  mountRoutes(app, store);

  // ── Tail ──
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
