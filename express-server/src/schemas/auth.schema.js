'use strict';

const { z, email } = require('./common');

const registerBody = z.object({
  email,
  password: z.string().min(12, 'Password must be at least 12 characters').max(200),
  fullName: z.string().trim().max(100).optional(),
});

const loginBody = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

module.exports = { registerBody, loginBody, refreshBody };
