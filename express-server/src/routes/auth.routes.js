'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const requireConsoleAuth = require('../middleware/requireConsoleAuth');
const { perIp } = require('../middleware/rateLimit');
const schemas = require('../schemas/auth.schema');
const authService = require('../services/auth.service');

function createAuthRoutes(store) {
  const router = express.Router();

  router.post(
    '/register',
    perIp({ limit: 10 }),
    validate({ body: schemas.registerBody }),
    (req, res) => {
      res.status(201).json({ data: authService.register(store, req.validated.body) });
    },
  );

  router.post(
    '/login',
    perIp({ limit: 10 }),
    validate({ body: schemas.loginBody }),
    (req, res) => {
      res.json({ data: authService.login(store, req.validated.body) });
    },
  );

  router.post('/refresh', validate({ body: schemas.refreshBody }), (req, res) => {
    res.json({ data: authService.refresh(store, req.validated.body) });
  });

  router.get('/me', requireConsoleAuth(store), (req, res) => {
    res.json({ data: { user: authService.me(store, req.user.id) } });
  });

  // Logout is idempotent: revokes the presented refresh token if any.
  router.post('/logout', requireConsoleAuth(store), (req, res) => {
    const refreshToken = (req.body || {}).refreshToken || null;
    res.json({ data: authService.logout(store, refreshToken) });
  });

  return router;
}

module.exports = createAuthRoutes;
