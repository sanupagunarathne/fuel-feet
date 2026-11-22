import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { apiErrorResponseSchema, healthResponseSchema } from '@fuel-feet/shared';
import { requireAdmin } from './auth.js';
import type { AuthDependencies } from './auth.js';
import { logger } from './logger.js';

export function createApp({ webOrigin, auth, databaseReady }: {
  webOrigin: string;
  auth?: AuthDependencies;
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
    limit: 60,
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
    logger.error({ requestId }, 'Request failed');
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
