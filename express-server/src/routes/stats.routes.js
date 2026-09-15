'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const requireConsoleAuth = require('../middleware/requireConsoleAuth');
const { perUser } = require('../middleware/rateLimit');
const schemas = require('../schemas/stats.schema');
const statsService = require('../services/stats.service');

function createStatsRoutes(store) {
  const router = express.Router();
  router.use(requireConsoleAuth(store), perUser());

  router.get('/summary', validate({ query: schemas.summaryQuery }), (req, res) => {
    res.json({ data: statsService.summary(store, req.user.id, req.validated.query.period) });
  });

  router.get('/recent', validate({ query: schemas.recentQuery }), (req, res) => {
    res.json({ data: statsService.recent(store, req.user.id, req.validated.query.limit) });
  });

  return router;
}

module.exports = createStatsRoutes;
