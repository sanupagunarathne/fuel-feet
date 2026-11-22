import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { apiErrorResponseSchema, healthResponseSchema } from '@fuel-feet/shared';
import { logger } from './logger.js';

export function createApp({ webOrigin }: { webOrigin: string }) {
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
