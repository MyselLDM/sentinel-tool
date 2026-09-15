'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const requireConsoleAuth = require('../middleware/requireConsoleAuth');
const { perUser } = require('../middleware/rateLimit');
const { toCsv } = require('../lib/csv');
const schemas = require('../schemas/requests.schema');
const requestsService = require('../services/requests.service');

const EXPORT_COLUMNS = [
  'request_id',
  'created_at',
  'goal',
  'subtask',
  'is_rejected',
  'rejection_reason',
  'nli_score',
  'nli_threshold',
  'nli_result',
  'contrastive_score',
  'contrastive_threshold',
  'contrastive_result',
  'response_time_ms',
  'model_version',
  'evaluation_mode',
];

function exportRow(r) {
  return {
    request_id: r.requestId,
    created_at: r.createdAt,
    goal: r.goal,
    subtask: r.subtask,
    is_rejected: r.isRejected,
    rejection_reason: r.rejectionReason,
    nli_score: r.nliScore,
    nli_threshold: r.nliThreshold,
    nli_result: r.nliResult,
    contrastive_score: r.contrastiveScore,
    contrastive_threshold: r.contrastiveThreshold,
    contrastive_result: r.contrastiveResult,
    response_time_ms: r.responseTimeMs,
    model_version: r.modelVersion,
    evaluation_mode: r.evaluationMode,
  };
}

function createRequestsRoutes(store) {
  const router = express.Router();
  router.use(requireConsoleAuth(store), perUser());

  // NOTE: must be registered before /:requestId.
  router.get('/export.csv', validate({ query: schemas.listRequestsQuery }), (req, res) => {
    const rows = requestsService.listForExport(store, req.user.id, req.validated.query);
    const csv = toCsv(EXPORT_COLUMNS, rows.map(exportRow));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="evaluation_requests.csv"');
    res.send(csv);
  });

  router.get('/', validate({ query: schemas.listRequestsQuery }), (req, res) => {
    const { requests, meta } = requestsService.list(store, req.user.id, req.validated.query);
    res.json({ data: { requests }, meta });
  });

  router.get('/:requestId', validate({ params: schemas.requestParams }), (req, res) => {
    res.json({
      data: { request: requestsService.get(store, req.user.id, req.validated.params.requestId) },
    });
  });

  return router;
}

module.exports = createRequestsRoutes;
