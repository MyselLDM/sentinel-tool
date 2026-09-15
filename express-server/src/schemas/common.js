'use strict';

const { z } = require('zod');

// Shared primitives (kept version-safe across zod 3/4).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const email = z
  .string()
  .trim()
  .max(255)
  .regex(EMAIL_RE, 'Must be a valid email address');

const uuidParam = z.string().regex(UUID_RE, 'Must be a valid UUID');

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Must be a valid ISO date');

module.exports = { z, email, uuidParam, isoDate, EMAIL_RE, UUID_RE };
