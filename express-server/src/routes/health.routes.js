'use strict';

const express = require('express');
const env = require('../config/env');
const inference = require('../services/inference.client');

/** Liveness (always 200) and readiness (checks the inference service). */
function createHealthRoutes() {
  const router = express.Router();

  router.get('/healthz', (req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  router.get('/readyz', async (req, res) => {
    let inferenceUp = true;
    if (!env.inferenceMock) {
      inferenceUp = await inference.ping();
    }
    const ok = inferenceUp;
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      dependencies: {
        store: 'up', // in-memory store is always ready
        inference: env.inferenceMock ? 'mocked' : inferenceUp ? 'up' : 'down',
      },
    });
  });

  return router;
}

module.exports = createHealthRoutes;
