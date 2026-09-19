'use strict';

const express = require('express');
const env = require('../config/env');
const inference = require('../services/inference.client');

/** Liveness (always 200) and readiness (checks the store + inference service). */
function createHealthRoutes(store) {
  const router = express.Router();

  router.get('/healthz', (req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  router.get('/readyz', async (req, res) => {
    let storeUp = true;
    try {
      store.db.prepare('SELECT 1').get();
    } catch {
      storeUp = false;
    }

    let inferenceUp = true;
    if (!env.inferenceMock) {
      inferenceUp = await inference.ping();
    }
    const ok = storeUp && inferenceUp;
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      dependencies: {
        store: storeUp ? 'up' : 'down',
        inference: env.inferenceMock ? 'mocked' : inferenceUp ? 'up' : 'down',
      },
    });
  });

  return router;
}

module.exports = createHealthRoutes;
