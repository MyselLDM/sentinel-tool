'use strict';

const { verifyToken } = require('../lib/jwt');
const { errors } = require('../lib/errors');

function bearerToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme && scheme.toLowerCase() === 'bearer' && token ? token : null;
}

/** Authenticate a console request via the access JWT → sets req.user. */
function requireConsoleAuth(store) {
  return (req, res, next) => {
    const token = bearerToken(req);
    if (!token) return next(errors.unauthorized('Missing bearer token'));

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      return next(errors.unauthorized('Invalid or expired token'));
    }

    if (decoded.typ !== 'access') {
      return next(errors.unauthorized('Invalid token type'));
    }

    const user = store.users.findById(decoded.sub);
    if (!user || !user.isActive) {
      return next(errors.unauthorized('Account not found or inactive'));
    }

    req.user = { id: user.id, email: user.email, isAdmin: !!user.isAdmin };
    return next();
  };
}

module.exports = requireConsoleAuth;
module.exports.bearerToken = bearerToken;
