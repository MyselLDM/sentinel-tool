'use strict';

const requestsService = require('./requests.service');

const PERIODS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/** Headline dashboard metrics for a period. */
function summary(store, userId, period = '24h') {
  const windowMs = PERIODS[period] ?? PERIODS['24h'];
  const since = new Date(Date.now() - windowMs).toISOString();

  const agg = store.requests.summarize(userId, since);
  return {
    totalRequests: agg.total,
    rejectionRate: agg.total ? Number((agg.rejected / agg.total).toFixed(4)) : 0,
    avgResponseTimeMs: Math.round(agg.avgResponseTimeMs),
    activeKeys: store.apiKeys.countActiveByUser(userId),
    period,
  };
}

/** Recent activity feed (newest first). */
function recent(store, userId, limit = 10) {
  const pageSize = Math.min(Math.max(limit, 1), 100);
  const { items } = store.requests.listForUser(userId, {
    page: 1,
    pageSize,
    sort: 'created_at',
  });
  return { requests: items.map(requestsService.toListItem) };
}

module.exports = { summary, recent, PERIODS };
