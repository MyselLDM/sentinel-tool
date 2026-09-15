'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/** Short-lived access token (Bearer on console requests). */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, isAdmin: !!user.isAdmin, typ: 'access' },
    env.jwtSecret,
    { expiresIn: env.jwtAccessTtl },
  );
}

/** Longer-lived refresh token; `jti` maps to a stored, revocable record. */
function signRefreshToken(user, jti) {
  return jwt.sign(
    { sub: user.id, typ: 'refresh', jti },
    env.jwtSecret,
    { expiresIn: env.jwtRefreshTtl },
  );
}

/** Verify a token; throws on invalid/expired. */
function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

/** ms until expiry for a decoded token (used for refresh-token records). */
function msUntilExpiry(decoded) {
  if (!decoded || !decoded.exp) return null;
  return Math.max(0, decoded.exp * 1000 - Date.now());
}

module.exports = { signAccessToken, signRefreshToken, verifyToken, msUntilExpiry };
