'use strict';

const createHealthRoutes = require('./health.routes');
const createAuthRoutes = require('./auth.routes');
const createKeysRoutes = require('./keys.routes');
const createEvaluateRoutes = require('./evaluate.routes');
const createRequestsRoutes = require('./requests.routes');
const createStatsRoutes = require('./stats.routes');
const createModelsRoutes = require('./models.routes');

/** Mount every router onto the app. */
function mountRoutes(app, store) {
  app.use(createHealthRoutes(store)); // /healthz, /readyz

  app.use('/api/auth', createAuthRoutes(store));
  app.use('/api/keys', createKeysRoutes(store));
  app.use('/api/requests', createRequestsRoutes(store));
  app.use('/api/stats', createStatsRoutes(store));
  app.use('/api', createEvaluateRoutes(store)); // /api/evaluate, /api/evaluate/preview
  app.use('/api', createModelsRoutes(store)); // /api/models, /api/metrics
}

module.exports = mountRoutes;
