import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { apiErrorResponseSchema, healthResponseSchema } from '@fuel-feet/shared';
import { requireAdmin } from './auth.js';
import type { AuthDependencies } from './auth.js';
import { MulterError } from 'multer';
import type { DocumentStorage } from './fleet/documents.js';
import { ZodError } from 'zod';
import { fleetRouter } from './fleet/router.js';
import { FleetError } from './fleet/common.js';
import type { Database } from './fleet/common.js';
import { logger } from './logger.js';

export function createApp({ webOrigin, auth, databaseReady, db, storage, maxDocumentBytes }: {
  webOrigin: string;
  auth?: AuthDependencies;
  db?: Database;
  storage?: DocumentStorage;
  maxDocumentBytes?: number;
  databaseReady?: () => Promise<void>;
}) {
  const app = express();
  app.disable('x-powered-by');

  app.use((request, response, next) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    response.setHeader('X-Request-Id', requestId);

    response.on('finish', () => {
      logger.info({
        requestId,
        method: request.method,
        statusCode: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }, 'Request completed');
    });
    next();
  });

  app.use(helmet());
  app.use(cors({ origin: [webOrigin] }));

  app.get('/api/health', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(healthResponseSchema.parse({ status: 'ok' }));
  });

  app.get('/api/ready', async (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (!auth || !databaseReady) throw new Error('Dependencies unavailable');
      await databaseReady();
      response.json({ status: 'ok' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });

  const accessLimiter = rateLimit({
    windowMs: 60_000,
    limit: 180,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.status(429).json(apiErrorResponseSchema.parse({
        error: {
          code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.',
          requestId: response.get('X-Request-Id'),
        },
      }));
    },
  });

  app.get('/api/me', accessLimiter, requireAdmin(auth), (_request, response) => {
    response.json(response.locals.admin);
  });

  if (db) app.use('/api', accessLimiter, requireAdmin(auth), fleetRouter(db, storage, maxDocumentBytes));

  app.use((_request, response) => {
    response.status(404).json(apiErrorResponseSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint was not found.',
        requestId: response.get('X-Request-Id'),
      },
    }));
  });

  const handleError: ErrorRequestHandler = (_error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(_error);
      return;
    }

    const requestId = response.get('X-Request-Id');
    const details = _error instanceof Error ? _error as Error & { code?: string; status?: number; cause?: { code?: string } } : undefined;
    const dbCode = details?.cause?.code ?? details?.code;
    const issue = _error instanceof FleetError ? _error
      : _error instanceof ZodError ? new FleetError(422, 'INVALID_INPUT', _error.issues.map((item) => `${item.path.join('.') ? item.path.join('.') + ' — ' : ''}${item.message}`).join(' '))
      : dbCode === '23505' || dbCode === '23P01' || dbCode === '40001' || dbCode === '40P01' ? new FleetError(409, 'CONFLICT', 'A matching record or concurrent change already exists.')
      : dbCode === '23503' || dbCode === '23514' ? new FleetError(422, 'INVALID_INPUT', 'The record does not meet a relationship or financial rule.')
      : _error instanceof MulterError ? (_error.code === 'LIMIT_FILE_SIZE'
        ? new FleetError(413, 'TOO_LARGE', 'The document exceeds the size limit.')
        : new FleetError(422, 'INVALID_UPLOAD', 'Upload one document using the file field.'))
      : details?.status === 413 ? new FleetError(413, 'TOO_LARGE', 'The request exceeds the size limit.')
      : details?.status === 400 ? new FleetError(400, 'INVALID_REQUEST', 'The request could not be read.')
      : null;
    if (issue) {
      response.status(issue.status).json(apiErrorResponseSchema.parse({ error: { code: issue.code, message: issue.message, requestId } }));
      return;
    }
    logger.error({ requestId, code: dbCode }, 'Request failed');
    response.status(500).json(apiErrorResponseSchema.parse({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
        requestId,
      },
    }));
  };

  app.use(handleError);
  return app;
}
