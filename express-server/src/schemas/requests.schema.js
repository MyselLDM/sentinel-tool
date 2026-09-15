'use strict';

const { z, isoDate } = require('./common');

const listRequestsQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    status: z.enum(['accepted', 'rejected']).optional(),
    q: z.string().trim().max(64).optional(),
    mode: z.enum(['standard', 'detailed']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    sort: z.enum(['created_at', 'response_time_ms']).default('created_at'),
  })
  .refine((d) => !d.from || !d.to || d.from <= d.to, {
    message: 'from must be <= to',
    path: ['from'],
  });

const requestParams = z.object({
  requestId: z.string().min(1).max(64),
});

module.exports = { listRequestsQuery, requestParams };
