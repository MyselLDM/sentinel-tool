'use strict';

const { z } = require('./common');

const summaryQuery = z.object({
  period: z.enum(['24h', '7d', '30d']).default('24h'),
});

const recentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

module.exports = { summaryQuery, recentQuery };
