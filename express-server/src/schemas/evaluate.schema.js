'use strict';

const { z } = require('./common');

const MODES = ['standard', 'detailed'];

const evaluateBody = z.object({
  goal: z.string().trim().min(1, 'goal is required').max(2000),
  subtask: z.string().trim().min(1, 'subtask is required').max(2000),
  mode: z.enum(MODES).default('standard'),
});

// Console-only: allows experimental threshold overrides (never persisted).
const previewBody = evaluateBody.extend({
  nliThreshold: z.number().gt(0).lt(1).optional(),
  contrastiveThreshold: z.number().gt(0).lt(1).optional(),
});

module.exports = { evaluateBody, previewBody, MODES };
