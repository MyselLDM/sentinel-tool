'use strict';

const { uuid } = require('../lib/crypto');

/**
 * In-memory data store.
 *
 * Implements the repository surface the services depend on. Swapping to
 * Supabase later means providing the same methods (async) over Supabase — the
 * services only ever go through `store`.
 */

function nowIso() {
  return new Date().toISOString();
}

function createMemoryStore() {
  /** @type {Map<string, any>} id -> row */
  const users = new Map();
  const usersByEmail = new Map(); // lowercased email -> id
  const apiKeys = new Map();
  const requests = new Map(); // id -> row
  const requestsByRequestId = new Map(); // requestId -> id
  const refreshTokens = new Map(); // jti -> row
  const modelMetrics = new Map(); // modelType -> row

  // ── users ────────────────────────────────────────────────────────────────
  const usersRepo = {
    create({ email, passwordHash, fullName = null, isAdmin = false }) {
      const id = uuid();
      const row = {
        id,
        email,
        username: null,
        fullName,
        passwordHash,
        isActive: true,
        isAdmin,
        lastLoginAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      users.set(id, row);
      usersByEmail.set(email.toLowerCase(), id);
      return row;
    },
    findByEmail(email) {
      const id = usersByEmail.get(String(email).toLowerCase());
      return id ? users.get(id) : null;
    },
    findById(id) {
      return users.get(id) || null;
    },
    touchLastLogin(id) {
      const row = users.get(id);
      if (row) {
        row.lastLoginAt = nowIso();
        row.updatedAt = row.lastLoginAt;
      }
      return row;
    },
  };

  // ── api keys ─────────────────────────────────────────────────────────────
  const apiKeysRepo = {
    create({
      userId,
      keyName,
      apiKeyHash,
      apiKeyPrefix,
      last4,
      rateLimitPerMinute,
      expiresAt = null,
    }) {
      const id = uuid();
      const row = {
        id,
        userId,
        keyName,
        apiKeyHash,
        apiKeyPrefix,
        last4,
        isActive: true,
        rateLimitPerMinute,
        createdAt: nowIso(),
        lastUsedAt: null,
        expiresAt,
      };
      apiKeys.set(id, row);
      return row;
    },
    listByUser(userId) {
      return [...apiKeys.values()]
        .filter((k) => k.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    findById(id) {
      return apiKeys.get(id) || null;
    },
    findByIdForUser(id, userId) {
      const row = apiKeys.get(id);
      return row && row.userId === userId ? row : null;
    },
    findByHash(hash) {
      return [...apiKeys.values()].find((k) => k.apiKeyHash === hash) || null;
    },
    update(id, patch) {
      const row = apiKeys.get(id);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
    remove(id) {
      return apiKeys.delete(id);
    },
    countActiveByUser(userId) {
      return [...apiKeys.values()].filter((k) => k.userId === userId && k.isActive).length;
    },
    touchLastUsed(id) {
      const row = apiKeys.get(id);
      if (row) row.lastUsedAt = nowIso();
      return row;
    },
  };

  // ── evaluation requests ──────────────────────────────────────────────────
  const requestsRepo = {
    insert(record) {
      const id = record.id || uuid();
      const row = { id, createdAt: nowIso(), ...record };
      requests.set(id, row);
      requestsByRequestId.set(row.requestId, id);
      return row;
    },
    findById(id) {
      return requests.get(id) || null;
    },
    findByRequestIdForUser(requestId, userId) {
      const id = requestsByRequestId.get(requestId);
      const row = id ? requests.get(id) : null;
      return row && row.userId === userId ? row : null;
    },
    listForUser(userId, filters = {}) {
      const {
        from,
        to,
        status,
        q,
        mode,
        page = 1,
        pageSize = 25,
        sort = 'created_at',
      } = filters;

      let rows = [...requests.values()].filter((r) => r.userId === userId);

      if (from) rows = rows.filter((r) => r.createdAt >= from);
      if (to) rows = rows.filter((r) => r.createdAt <= to);
      if (status === 'rejected') rows = rows.filter((r) => r.isRejected === true);
      if (status === 'accepted') rows = rows.filter((r) => r.isRejected === false);
      if (mode) rows = rows.filter((r) => r.evaluationMode === mode);
      if (q) rows = rows.filter((r) => r.requestId.includes(q));

      const field = sort === 'response_time_ms' ? 'responseTimeMs' : 'createdAt';
      rows.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        return typeof av === 'number' ? bv - av : String(bv).localeCompare(String(av));
      });

      const total = rows.length;
      const start = (page - 1) * pageSize;
      return { items: rows.slice(start, start + pageSize), total };
    },
    listForUserRaw(userId, filters = {}) {
      return this.listForUser(userId, { ...filters, page: 1, pageSize: 1_000_000 }).items;
    },
    summarize(userId, sinceIso) {
      const rows = [...requests.values()].filter(
        (r) => r.userId === userId && (!sinceIso || r.createdAt >= sinceIso),
      );
      const total = rows.length;
      const rejected = rows.filter((r) => r.isRejected).length;
      const avg =
        total > 0
          ? rows.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0) / total
          : 0;
      return { total, rejected, avgResponseTimeMs: avg };
    },
  };

  // ── refresh tokens ───────────────────────────────────────────────────────
  const refreshTokensRepo = {
    create({ userId, jti, tokenHash, expiresAt }) {
      const row = { jti, userId, tokenHash, expiresAt, revokedAt: null, createdAt: nowIso() };
      refreshTokens.set(jti, row);
      return row;
    },
    find(jti) {
      return refreshTokens.get(jti) || null;
    },
    revoke(jti) {
      const row = refreshTokens.get(jti);
      if (row) row.revokedAt = nowIso();
      return row;
    },
    revokeAllForUser(userId) {
      let count = 0;
      for (const row of refreshTokens.values()) {
        if (row.userId === userId && !row.revokedAt) {
          row.revokedAt = nowIso();
          count += 1;
        }
      }
      return count;
    },
  };

  // ── model metrics ────────────────────────────────────────────────────────
  const metricsRepo = {
    record(modelType, { rejected, score, responseTimeMs }) {
      const row =
        modelMetrics.get(modelType) ||
        {
          modelType,
          evaluationCount: 0,
          rejectionCount: 0,
          avgScore: 0,
          avgResponseTimeMs: 0,
          lastUpdated: nowIso(),
        };
      const n = row.evaluationCount;
      row.avgScore = (row.avgScore * n + (score || 0)) / (n + 1);
      row.avgResponseTimeMs = (row.avgResponseTimeMs * n + (responseTimeMs || 0)) / (n + 1);
      row.evaluationCount = n + 1;
      if (rejected) row.rejectionCount += 1;
      row.lastUpdated = nowIso();
      modelMetrics.set(modelType, row);
      return row;
    },
    list() {
      return [...modelMetrics.values()];
    },
  };

  return {
    users: usersRepo,
    apiKeys: apiKeysRepo,
    requests: requestsRepo,
    refreshTokens: refreshTokensRepo,
    modelMetrics: metricsRepo,
  };
}

module.exports = { createMemoryStore };
