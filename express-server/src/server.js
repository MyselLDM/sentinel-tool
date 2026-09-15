'use strict';

const env = require('./config/env');
const logger = require('./lib/logger');
const { createApp } = require('./app');
const { createStore } = require('./store');
const { seedDemo } = require('./seed');

function main() {
  const store = createStore();
  const app = createApp({ store });

  if (env.seedDemo) {
    seedDemo(store);
  }

  const server = app.listen(env.port, () => {
    logger.info('server_started', {
      port: env.port,
      nodeEnv: env.nodeEnv,
      corsOrigins: env.corsOrigins,
      inferenceUrl: env.inferenceUrl,
      inferenceMock: env.inferenceMock,
      store: 'in-memory',
    });
    if (env.ephemeralSecret) {
      logger.warn('jwt_secret_ephemeral', {
        hint: 'JWT_SECRET is unset — a random secret was generated; tokens are invalidated on restart.',
      });
    }
  });

  const shutdown = (signal) => {
    logger.info('shutting_down', { signal });
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
