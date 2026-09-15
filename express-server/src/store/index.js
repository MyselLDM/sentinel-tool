'use strict';

const { createMemoryStore } = require('./memory');

/**
 * Data-store factory.
 *
 * Currently returns the in-memory store. To move to Supabase later, add a
 * `createSupabaseStore()` here and select it based on config — the services are
 * written only against the returned interface.
 */
function createStore() {
  return createMemoryStore();
}

module.exports = { createStore };
