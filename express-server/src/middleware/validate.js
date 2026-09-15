'use strict';

const { errors } = require('../lib/errors');

/**
 * Validate and coerce request parts against zod schemas.
 *
 *   validate({ body: schema, query: schema, params: schema })
 *
 * Parsed values are exposed on `req.validated` (req.query is a read-only getter
 * in Express 5, so we don't mutate it).
 */
function validate(schemas) {
  return (req, res, next) => {
    const validated = {};

    for (const part of ['body', 'query', 'params']) {
      const schema = schemas[part];
      const source = req[part];
      if (!schema) {
        validated[part] = source;
        continue;
      }

      const result = schema.safeParse(source ?? {});
      if (!result.success) {
        const details = {};
        for (const issue of result.error.issues) {
          const path = issue.path.length ? issue.path.join('.') : part;
          details[path] = issue.message;
        }
        return next(errors.validation('Request validation failed', details));
      }
      validated[part] = result.data;
    }

    req.validated = validated;
    return next();
  };
}

module.exports = validate;
