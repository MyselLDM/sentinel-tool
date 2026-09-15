'use strict';

const { signAccessToken, signRefreshToken, verifyToken, msUntilExpiry } = require('../lib/jwt');
const { hashPassword, verifyPassword } = require('../lib/password');
const { uuid, hashApiKey } = require('../lib/crypto');
const { errors } = require('../lib/errors');

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isAdmin: !!user.isAdmin,
    createdAt: user.createdAt,
  };
}

function issueTokens(store, user) {
  const jti = uuid();
  const refreshToken = signRefreshToken(user, jti);
  const ttlMs = msUntilExpiry(verifyToken(refreshToken)) || 0;
  store.refreshTokens.create({
    userId: user.id,
    jti,
    tokenHash: hashApiKey(refreshToken),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

function register(store, { email, password, fullName }) {
  if (store.users.findByEmail(email)) {
    throw errors.conflict('An account with that email already exists');
  }
  const user = store.users.create({
    email,
    passwordHash: hashPassword(password),
    fullName: fullName || null,
  });
  return { user: publicUser(user), ...issueTokens(store, user) };
}

function login(store, { email, password }) {
  const user = store.users.findByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw errors.invalidCredentials();
  }
  if (!user.isActive) throw errors.forbidden('Account is disabled');

  store.users.touchLastLogin(user.id);
  return { user: publicUser(user), ...issueTokens(store, user) };
}

function refresh(store, { refreshToken }) {
  let decoded;
  try {
    decoded = verifyToken(refreshToken);
  } catch {
    throw errors.unauthorized('Invalid or expired refresh token');
  }
  if (decoded.typ !== 'refresh') throw errors.unauthorized('Invalid token type');

  const record = store.refreshTokens.find(decoded.jti);
  if (!record || record.revokedAt || record.tokenHash !== hashApiKey(refreshToken)) {
    throw errors.unauthorized('Refresh token is no longer valid');
  }
  if (Date.parse(record.expiresAt) <= Date.now()) {
    throw errors.unauthorized('Refresh token has expired');
  }

  const user = store.users.findById(decoded.sub);
  if (!user || !user.isActive) throw errors.unauthorized('Account not found or inactive');

  store.refreshTokens.revoke(decoded.jti); // rotate
  return { user: publicUser(user), ...issueTokens(store, user) };
}

function logout(store, refreshToken) {
  if (!refreshToken) return { revoked: 0 };
  try {
    const decoded = verifyToken(refreshToken);
    if (decoded.jti) {
      store.refreshTokens.revoke(decoded.jti);
      return { revoked: 1 };
    }
  } catch {
    /* ignore malformed token — logout is idempotent */
  }
  return { revoked: 0 };
}

function me(store, userId) {
  const user = store.users.findById(userId);
  if (!user) throw errors.notFound('User not found');
  return publicUser(user);
}

module.exports = { register, login, refresh, logout, me, publicUser };
