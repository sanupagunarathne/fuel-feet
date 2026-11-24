import express from 'express';
import { recordsRoutes } from './records.js';
import { rateRoutes } from './rates.js';
import { tripRoutes } from './trips.js';
import { reportRoutes } from './reporting.js';
import { documentRoutes } from './documents.js';
import type { DocumentStorage } from './documents.js';
import type { Database } from './common.js';

export function fleetRouter(db: Database, storage?: DocumentStorage, maxBytes?: number) {
  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));
  recordsRoutes(router, db);
  rateRoutes(router, db);
  tripRoutes(router, db);
  reportRoutes(router, db);
  documentRoutes(router, db, storage, maxBytes);
  return router;
}
