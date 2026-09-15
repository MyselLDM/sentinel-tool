'use strict';

const express = require('express');
const requireConsoleAuth = require('../middleware/requireConsoleAuth');
const { perUser } = require('../middleware/rateLimit');
const modelsService = require('../services/models.service');

/** Read-only model info (proxied) + model metrics counters. */
function createModelsRoutes(store) {
  const router = express.Router();
  router.use(requireConsoleAuth(store), perUser());

  router.get('/models', async (req, res) => {
    const { data, stale } = await modelsService.fetchModels();
    res.json({ data: { ...data, stale } });
  });

  router.get('/metrics', (req, res) => {
    res.json({ data: { metrics: store.modelMetrics.list() } });
  });

  return router;
}

module.exports = createModelsRoutes;
