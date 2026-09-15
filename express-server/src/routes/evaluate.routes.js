'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const requireApiKey = require('../middleware/requireApiKey');
const requireConsoleAuth = require('../middleware/requireConsoleAuth');
const { perApiKey, perUser } = require('../middleware/rateLimit');
const schemas = require('../schemas/evaluate.schema');
const evaluationService = require('../services/evaluation.service');

function createEvaluateRoutes(store) {
  const router = express.Router();

  // ── Console-only preview (experimental threshold override, never logged) ──
  router.post(
    '/evaluate/preview',
    requireConsoleAuth(store),
    perUser(),
    validate({ body: schemas.previewBody }),
    async (req, res) => {
      const { goal, subtask, mode = 'standard', nliThreshold, contrastiveThreshold } =
        req.validated.body;

      const { id, result, record } = await evaluationService.runOnce(store, {
        goal,
        subtask,
        mode,
        nliThreshold,
        contrastiveThreshold,
        userId: req.user.id,
        apiKeyId: null,
        userAgent: req.get('user-agent'),
        persist: false,
      });

      res.json({
        data: {
          id,
          result: !result.is_rejected,
          isRejected: result.is_rejected,
          rejectionReason: result.rejection_reason,
          date: new Date().toISOString(),
          modelVersion: record.modelVersion,
          responseTimeMs: record.responseTimeMs,
          nli: {
            score: record.nliScore,
            rejected: record.nliResult,
            threshold: record.nliThreshold,
            rawScores: record.nliRawScores,
          },
          contrastive: {
            score: record.contrastiveScore,
            rejected: record.contrastiveResult,
            threshold: record.contrastiveThreshold,
          },
        },
      });
    },
  );

  // ── Public data-plane endpoint (API key auth + per-key rate limit) ──
  router.post(
    '/evaluate',
    requireApiKey(store),
    perApiKey(),
    validate({ body: schemas.evaluateBody }),
    async (req, res) => {
      const { goal, subtask, mode } = req.validated.body;

      const { id, result } = await evaluationService.runOnce(store, {
        goal,
        subtask,
        mode,
        apiKeyId: req.apiKey.id,
        userId: req.apiKey.userId,
        userAgent: req.get('user-agent'),
        persist: true,
      });

      // Spec-compatible flat response (no envelope).
      res.json(evaluationService.toPublicResponse({ id, result, mode }));
    },
  );

  return router;
}

module.exports = createEvaluateRoutes;
