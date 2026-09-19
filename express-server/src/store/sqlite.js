'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { uuid } = require('../lib/crypto');

/**
 * SQLite-backed data store (better-sqlite3, synchronous).
 *
 * This is the single persistence layer for the gateway: users, API keys,
 * evaluation requests, refresh tokens and model metrics all live in one local
 * SQLite file (see `env.dbPath`). It implements the same repository surface the
 * services depend on — services only ever go through `store`.
 *
 * Columns are snake_case (matching the plan's data model); rows are mapped back
 * to the camelCase objects the services/routes expect.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  username      TEXT,
  full_name     TEXT,
  password_hash TEXT    NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id                    TEXT    PRIMARY KEY,
  user_id               TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_name              TEXT    NOT NULL,
  api_key_hash          TEXT    NOT NULL,
  api_key_prefix        TEXT    NOT NULL,
  last4                 TEXT    NOT NULL,
  is_active             INTEGER NOT NULL DEFAULT 1,
  rate_limit_per_minute INTEGER NOT NULL,
  created_at            TEXT    NOT NULL,
  last_used_at          TEXT,
  expires_at            TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(api_key_hash);
CREATE INDEX        IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS evaluation_requests (
  id                    TEXT    PRIMARY KEY,
  user_id               TEXT    REFERENCES users(id) ON DELETE SET NULL,
  api_key_id            TEXT,
  request_id            TEXT    NOT NULL,
  goal                  TEXT    NOT NULL,
  subtask               TEXT    NOT NULL,
  is_rejected           INTEGER NOT NULL,
  rejection_reason      TEXT,
  nli_score             REAL,
  nli_result            INTEGER,
  nli_threshold         REAL,
  nli_raw_scores        TEXT,
  contrastive_score     REAL,
  contrastive_result    INTEGER,
  contrastive_threshold REAL,
  response_time_ms      INTEGER,
  model_version         TEXT,
  evaluation_mode       TEXT,
  user_agent            TEXT,
  created_at            TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_user_created ON evaluation_requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_request_id   ON evaluation_requests(request_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti        TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS model_metrics (
  model_type           TEXT PRIMARY KEY,
  evaluation_count     INTEGER NOT NULL DEFAULT 0,
  rejection_count      INTEGER NOT NULL DEFAULT 0,
  avg_score            REAL    NOT NULL DEFAULT 0,
  avg_response_time_ms REAL    NOT NULL DEFAULT 0,
  last_updated         TEXT    NOT NULL
);
`;

function nowIso() {
  return new Date().toISOString();
}

/** SQLite stores booleans as 0/1 → map back to real booleans (null stays null). */
function toBool(value) {
  return value === null || value === undefined ? null : !!value;
}

// ── row mappers (snake_case columns → camelCase objects) ─────────────────────
function mapUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    username: r.username,
    fullName: r.full_name,
    passwordHash: r.password_hash,
    isActive: !!r.is_active,
    isAdmin: !!r.is_admin,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapApiKey(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    keyName: r.key_name,
    apiKeyHash: r.api_key_hash,
    apiKeyPrefix: r.api_key_prefix,
    last4: r.last4,
    isActive: !!r.is_active,
    rateLimitPerMinute: r.rate_limit_per_minute,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
  };
}

function mapRequest(r) {
  if (!r) return null;
  let rawScores = null;
  if (r.nli_raw_scores) {
    try {
      rawScores = JSON.parse(r.nli_raw_scores);
    } catch {
      rawScores = null;
    }
  }
  return {
    id: r.id,
    userId: r.user_id,
    apiKeyId: r.api_key_id,
    requestId: r.request_id,
    goal: r.goal,
    subtask: r.subtask,
    isRejected: !!r.is_rejected,
    rejectionReason: r.rejection_reason,
    nliScore: r.nli_score,
    nliResult: toBool(r.nli_result),
    nliThreshold: r.nli_threshold,
    nliRawScores: rawScores,
    contrastiveScore: r.contrastive_score,
    contrastiveResult: toBool(r.contrastive_result),
    contrastiveThreshold: r.contrastive_threshold,
    responseTimeMs: r.response_time_ms,
    modelVersion: r.model_version,
    evaluationMode: r.evaluation_mode,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  };
}

function mapRefreshToken(r) {
  if (!r) return null;
  return {
    jti: r.jti,
    userId: r.user_id,
    tokenHash: r.token_hash,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  };
}

function mapMetric(r) {
  if (!r) return null;
  return {
    modelType: r.model_type,
    evaluationCount: r.evaluation_count,
    rejectionCount: r.rejection_count,
    avgScore: r.avg_score,
    avgResponseTimeMs: r.avg_response_time_ms,
    lastUpdated: r.last_updated,
  };
}

function createSqliteStore({ filename } = {}) {
  const dbFile = filename || ':memory:';
  if (dbFile !== ':memory:' && !dbFile.startsWith('file:')) {
    fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
  }

  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);

  // ── users ────────────────────────────────────────────────────────────────
  const usersRepo = {
    create({ email, passwordHash, fullName = null, isAdmin = false }) {
      const id = uuid();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO users (id, email, username, full_name, password_hash, is_active, is_admin,
                            last_login_at, created_at, updated_at)
         VALUES (@id, @email, NULL, @full_name, @password_hash, 1, @is_admin, NULL, @created_at, @updated_at)`,
      ).run({
        id,
        email,
        full_name: fullName ?? null,
        password_hash: passwordHash,
        is_admin: isAdmin ? 1 : 0,
        created_at: ts,
        updated_at: ts,
      });
      return usersRepo.findById(id);
    },
    findByEmail(email) {
      return mapUser(db.prepare('SELECT * FROM users WHERE email = ?').get(String(email)));
    },
    findById(id) {
      return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    },
    touchLastLogin(id) {
      const ts = nowIso();
      const info = db
        .prepare('UPDATE users SET last_login_at = @ts, updated_at = @ts WHERE id = @id')
        .run({ ts, id });
      return info.changes ? usersRepo.findById(id) : null;
    },
  };

  // ── api keys ─────────────────────────────────────────────────────────────
  const API_KEY_COLUMNS = {
    keyName: 'key_name',
    isActive: 'is_active',
    rateLimitPerMinute: 'rate_limit_per_minute',
    expiresAt: 'expires_at',
  };

  const apiKeysRepo = {
    create({ userId, keyName, apiKeyHash, apiKeyPrefix, last4, rateLimitPerMinute, expiresAt = null }) {
      const id = uuid();
      db.prepare(
        `INSERT INTO api_keys (id, user_id, key_name, api_key_hash, api_key_prefix, last4,
                               is_active, rate_limit_per_minute, created_at, last_used_at, expires_at)
         VALUES (@id, @user_id, @key_name, @api_key_hash, @api_key_prefix, @last4,
                 1, @rate_limit_per_minute, @created_at, NULL, @expires_at)`,
      ).run({
        id,
        user_id: userId,
        key_name: keyName,
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        last4,
        rate_limit_per_minute: rateLimitPerMinute,
        created_at: nowIso(),
        expires_at: expiresAt ?? null,
      });
      return apiKeysRepo.findById(id);
    },
    listByUser(userId) {
      return db
        .prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC, rowid ASC')
        .all(userId)
        .map(mapApiKey);
    },
    findById(id) {
      return mapApiKey(db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id));
    },
    findByIdForUser(id, userId) {
      return mapApiKey(
        db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?').get(id, userId),
      );
    },
    findByHash(hash) {
      return mapApiKey(db.prepare('SELECT * FROM api_keys WHERE api_key_hash = ?').get(hash));
    },
    update(id, patch) {
      const sets = [];
      const params = { id };
      for (const [key, column] of Object.entries(API_KEY_COLUMNS)) {
        if (!(key in patch)) continue;
        let value = patch[key];
        if (typeof value === 'boolean') value = value ? 1 : 0;
        sets.push(`${column} = @${key}`);
        params[key] = value ?? null;
      }
      if (!sets.length) return apiKeysRepo.findById(id);
      const info = db
        .prepare(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = @id`)
        .run(params);
      return info.changes ? apiKeysRepo.findById(id) : null;
    },
    remove(id) {
      return db.prepare('DELETE FROM api_keys WHERE id = ?').run(id).changes > 0;
    },
    countActiveByUser(userId) {
      return db
        .prepare('SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ? AND is_active = 1')
        .get(userId).n;
    },
    touchLastUsed(id) {
      const info = db
        .prepare('UPDATE api_keys SET last_used_at = @ts WHERE id = @id')
        .run({ ts: nowIso(), id });
      return info.changes ? apiKeysRepo.findById(id) : null;
    },
  };

  // ── evaluation requests ──────────────────────────────────────────────────
  const requestsRepo = {
    insert(record) {
      const id = record.id || uuid();
      const createdAt = record.createdAt || nowIso();
      db.prepare(
        `INSERT INTO evaluation_requests (
           id, user_id, api_key_id, request_id, goal, subtask, is_rejected, rejection_reason,
           nli_score, nli_result, nli_threshold, nli_raw_scores,
           contrastive_score, contrastive_result, contrastive_threshold,
           response_time_ms, model_version, evaluation_mode, user_agent, created_at)
         VALUES (
           @id, @user_id, @api_key_id, @request_id, @goal, @subtask, @is_rejected, @rejection_reason,
           @nli_score, @nli_result, @nli_threshold, @nli_raw_scores,
           @contrastive_score, @contrastive_result, @contrastive_threshold,
           @response_time_ms, @model_version, @evaluation_mode, @user_agent, @created_at)`,
      ).run({
        id,
        user_id: record.userId ?? null,
        api_key_id: record.apiKeyId ?? null,
        request_id: record.requestId,
        goal: record.goal,
        subtask: record.subtask,
        is_rejected: record.isRejected ? 1 : 0,
        rejection_reason: record.rejectionReason ?? null,
        nli_score: record.nliScore ?? null,
        nli_result: record.nliResult == null ? null : record.nliResult ? 1 : 0,
        nli_threshold: record.nliThreshold ?? null,
        nli_raw_scores: record.nliRawScores == null ? null : JSON.stringify(record.nliRawScores),
        contrastive_score: record.contrastiveScore ?? null,
        contrastive_result:
          record.contrastiveResult == null ? null : record.contrastiveResult ? 1 : 0,
        contrastive_threshold: record.contrastiveThreshold ?? null,
        response_time_ms: record.responseTimeMs ?? null,
        model_version: record.modelVersion ?? null,
        evaluation_mode: record.evaluationMode ?? null,
        user_agent: record.userAgent ?? null,
        created_at: createdAt,
      });
      return requestsRepo.findById(id);
    },
    findById(id) {
      return mapRequest(db.prepare('SELECT * FROM evaluation_requests WHERE id = ?').get(id));
    },
    findByRequestIdForUser(requestId, userId) {
      return mapRequest(
        db
          .prepare(
            `SELECT * FROM evaluation_requests
             WHERE request_id = ? AND user_id = ?
             ORDER BY rowid DESC LIMIT 1`,
          )
          .get(requestId, userId),
      );
    },
    listForUser(userId, filters = {}) {
      const { from, to, status, q, mode, page = 1, pageSize = 25, sort = 'created_at' } = filters;

      const where = ['user_id = @userId'];
      const params = { userId };
      if (from) {
        where.push('created_at >= @from');
        params.from = from;
      }
      if (to) {
        where.push('created_at <= @to');
        params.to = to;
      }
      if (status === 'rejected') where.push('is_rejected = 1');
      else if (status === 'accepted') where.push('is_rejected = 0');
      if (mode) {
        where.push('evaluation_mode = @mode');
        params.mode = mode;
      }
      if (q) {
        // Literal substring match (mirrors the previous `.includes(q)` behaviour).
        where.push('instr(request_id, @q) > 0');
        params.q = q;
      }

      const orderColumn = sort === 'response_time_ms' ? 'response_time_ms' : 'created_at';
      const whereSql = where.join(' AND ');

      const total = db
        .prepare(`SELECT COUNT(*) AS n FROM evaluation_requests WHERE ${whereSql}`)
        .get(params).n;

      const items = db
        .prepare(
          `SELECT * FROM evaluation_requests
           WHERE ${whereSql}
           ORDER BY ${orderColumn} DESC, rowid ASC
           LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
        .map(mapRequest);

      return { items, total };
    },
    listForUserRaw(userId, filters = {}) {
      return requestsRepo.listForUser(userId, {
        ...filters,
        page: 1,
        pageSize: 1_000_000,
      }).items;
    },
    summarize(userId, sinceIso) {
      const params = { userId };
      let sql = `SELECT COUNT(*) AS total,
                        COALESCE(SUM(is_rejected), 0) AS rejected,
                        AVG(COALESCE(response_time_ms, 0)) AS avg
                 FROM evaluation_requests WHERE user_id = @userId`;
      if (sinceIso) {
        sql += ' AND created_at >= @since';
        params.since = sinceIso;
      }
      const row = db.prepare(sql).get(params);
      return {
        total: row.total,
        rejected: row.rejected,
        avgResponseTimeMs: row.avg || 0,
      };
    },
  };

  // ── refresh tokens ───────────────────────────────────────────────────────
  const refreshTokensRepo = {
    create({ userId, jti, tokenHash, expiresAt }) {
      db.prepare(
        `INSERT INTO refresh_tokens (jti, user_id, token_hash, expires_at, revoked_at, created_at)
         VALUES (@jti, @user_id, @token_hash, @expires_at, NULL, @created_at)`,
      ).run({
        jti,
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_at: nowIso(),
      });
      return refreshTokensRepo.find(jti);
    },
    find(jti) {
      return mapRefreshToken(db.prepare('SELECT * FROM refresh_tokens WHERE jti = ?').get(jti));
    },
    revoke(jti) {
      const info = db
        .prepare('UPDATE refresh_tokens SET revoked_at = @ts WHERE jti = @jti')
        .run({ ts: nowIso(), jti });
      return info.changes ? refreshTokensRepo.find(jti) : null;
    },
    revokeAllForUser(userId) {
      return db
        .prepare('UPDATE refresh_tokens SET revoked_at = @ts WHERE user_id = @userId AND revoked_at IS NULL')
        .run({ ts: nowIso(), userId }).changes;
    },
  };

  // ── model metrics ────────────────────────────────────────────────────────
  const metricsRepo = {
    record(modelType, { rejected, score, responseTimeMs }) {
      const existing = db
        .prepare('SELECT * FROM model_metrics WHERE model_type = ?')
        .get(modelType);
      const n = existing ? existing.evaluation_count : 0;
      const prevScore = existing ? existing.avg_score : 0;
      const prevRt = existing ? existing.avg_response_time_ms : 0;
      const avgScore = (prevScore * n + (score || 0)) / (n + 1);
      const avgResponseTimeMs = (prevRt * n + (responseTimeMs || 0)) / (n + 1);

      db.prepare(
        `INSERT INTO model_metrics
           (model_type, evaluation_count, rejection_count, avg_score, avg_response_time_ms, last_updated)
         VALUES (@model_type, @evaluation_count, @rejection_count, @avg_score, @avg_response_time_ms, @last_updated)
         ON CONFLICT(model_type) DO UPDATE SET
           evaluation_count     = excluded.evaluation_count,
           rejection_count      = excluded.rejection_count,
           avg_score            = excluded.avg_score,
           avg_response_time_ms = excluded.avg_response_time_ms,
           last_updated         = excluded.last_updated`,
      ).run({
        model_type: modelType,
        evaluation_count: n + 1,
        rejection_count: (existing ? existing.rejection_count : 0) + (rejected ? 1 : 0),
        avg_score: avgScore,
        avg_response_time_ms: avgResponseTimeMs,
        last_updated: nowIso(),
      });

      return mapMetric(
        db.prepare('SELECT * FROM model_metrics WHERE model_type = ?').get(modelType),
      );
    },
    list() {
      return db.prepare('SELECT * FROM model_metrics ORDER BY model_type ASC').all().map(mapMetric);
    },
  };

  return {
    filename: dbFile,
    db,
    users: usersRepo,
    apiKeys: apiKeysRepo,
    requests: requestsRepo,
    refreshTokens: refreshTokensRepo,
    modelMetrics: metricsRepo,
    close() {
      db.close();
    },
  };
}

module.exports = { createSqliteStore };
