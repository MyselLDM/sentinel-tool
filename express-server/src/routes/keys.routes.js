'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const requireConsoleAuth = require('../middleware/requireConsoleAuth');
const schemas = require('../schemas/keys.schema');
const keysService = require('../services/keys.service');

function createKeysRoutes(store) {
  const router = express.Router();
  router.use(requireConsoleAuth(store));

  router.get('/', (req, res) => {
    res.json({ data: { keys: keysService.list(store, req.user.id) } });
  });

  router.post('/', validate({ body: schemas.createKeyBody }), (req, res) => {
    res.status(201).json({ data: keysService.create(store, req.user.id, req.validated.body) });
  });

  router.get('/:id', validate({ params: schemas.keyParams }), (req, res) => {
    res.json({ data: { key: keysService.get(store, req.user.id, req.validated.params.id) } });
  });

  router.patch(
    '/:id',
    validate({ params: schemas.keyParams, body: schemas.updateKeyBody }),
    (req, res) => {
      res.json({
        data: { key: keysService.update(store, req.user.id, req.validated.params.id, req.validated.body) },
      });
    },
  );

  router.delete('/:id', validate({ params: schemas.keyParams }), (req, res) => {
    res.json({ data: keysService.remove(store, req.user.id, req.validated.params.id) });
  });

  return router;
}

module.exports = createKeysRoutes;
