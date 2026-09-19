'use strict';

const env = require('../config/env');
const { createSqliteStore } = require('./sqlite');

/**
 * Data-store factory.
 *
 * The gateway persists everything to a local SQLite database (see
 * `createSqliteStore()` in ./sqlite.js and `env.dbPath`). Pass `filename` to
 * override the file (e.g. `:memory:` in tests); defaults to `env.dbPath`.
 */
function createStore({ filename } = {}) {
  return createSqliteStore({ filename: filename || env.dbPath });
}

module.exports = { createStore };
