'use strict';

const env = require('../config/env');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const THRESHOLD = env.isProd ? LEVELS.info : LEVELS.debug;

function emit(level, msg, fields) {
  if (LEVELS[level] < THRESHOLD) return;
  const record = { ts: new Date().toISOString(), level, msg, ...fields };
  const line = JSON.stringify(record);
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

module.exports = {
  debug: (msg, fields) => emit('debug', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields),
};
