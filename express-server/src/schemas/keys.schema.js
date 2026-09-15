'use strict';

const { z, uuidParam } = require('./common');

const createKeyBody = z
  .object({
    keyName: z.string().trim().min(1, 'keyName is required').max(100),
    rateLimitPerMinute: z.coerce.number().int().min(1).max(10000).optional(),
    expiresAt: z.string().nullable().optional(),
  })
  .refine(
    (d) => d.expiresAt == null || (!Number.isNaN(Date.parse(d.expiresAt)) && Date.parse(d.expiresAt) > Date.now()),
    { message: 'expiresAt must be a future ISO date', path: ['expiresAt'] },
  );

const updateKeyBody = z.object({
  isActive: z.boolean().optional(),
  keyName: z.string().trim().min(1).max(100).optional(),
});

const keyParams = z.object({ id: uuidParam });

module.exports = { createKeyBody, updateKeyBody, keyParams };
