import { createSupabaseVerifier } from './auth.js';
import { supabaseStorage } from './fleet/documents.js';
import { createDatabase } from './database.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { RequestHandler } from 'express';

export function createRuntime(environment: NodeJS.ProcessEnv, options: {
  maxDatabaseConnectionUses?: number;
  accessLimiter?: RequestHandler;
} = {}) {
  const config = loadConfig(environment);
  const db = config.databaseUrl ? createDatabase(config.databaseUrl, options.maxDatabaseConnectionUses) : undefined;
  const auth = db && config.supabase ? {
    verify: createSupabaseVerifier(config.supabase.url, config.supabase.key),
    findAdmin: db.findAdmin,
  } : undefined;
  const app = createApp({
    webOrigin: config.webOrigin,
    auth,
    db: db?.db,
    storage: config.supabase && environment.SUPABASE_STORAGE_KEY
      ? supabaseStorage(config.supabase.url, environment.SUPABASE_STORAGE_KEY, environment.SUPABASE_DOCUMENT_BUCKET || 'fuel-feet-documents')
      : undefined,
    maxDocumentBytes: config.maxDocumentBytes,
    databaseReady: db?.checkReady,
    accessLimiter: options.accessLimiter,
  });
  return { app, port: config.port, db };
}
