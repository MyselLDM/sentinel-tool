'use strict';

const { errors } = require('../lib/errors');

/** Compact projection used by the logs list and dashboard feed. */
function toListItem(r) {
  return {
    id: r.id,
    requestId: r.requestId,
    createdAt: r.createdAt,
    goal: r.goal,
    subtask: r.subtask,
    isRejected: r.isRejected,
    rejectionReason: r.rejectionReason,
    responseTimeMs: r.responseTimeMs,
    modelVersion: r.modelVersion,
    evaluationMode: r.evaluationMode,
  };
}

/** Full record for the detail view. */
function toDetail(r) {
  return {
    id: r.id,
    requestId: r.requestId,
    createdAt: r.createdAt,
    goal: r.goal,
    subtask: r.subtask,
    isRejected: r.isRejected,
    rejectionReason: r.rejectionReason,
    nli: {
      score: r.nliScore,
      result: r.nliResult,
      threshold: r.nliThreshold,
      rawScores: r.nliRawScores,
    },
    contrastive: {
      score: r.contrastiveScore,
      result: r.contrastiveResult,
      threshold: r.contrastiveThreshold,
    },
    responseTimeMs: r.responseTimeMs,
    modelVersion: r.modelVersion,
    evaluationMode: r.evaluationMode,
    userAgent: r.userAgent,
    apiKeyId: r.apiKeyId,
  };
}

function list(store, userId, filters) {
  const { items, total } = store.requests.listForUser(userId, filters);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  return {
    requests: items.map(toListItem),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

function get(store, userId, requestId) {
  const row = store.requests.findByRequestIdForUser(requestId, userId);
  if (!row) throw errors.notFound('Evaluation not found');
  return toDetail(row);
}

/** Rows for CSV export (same filters, no pagination). */
function listForExport(store, userId, filters) {
  return store.requests.listForUserRaw(userId, filters);
}

module.exports = { list, get, listForExport, toListItem, toDetail };
