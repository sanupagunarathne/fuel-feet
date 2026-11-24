import { createSupabaseVerifier } from './auth.js';
import { supabaseStorage } from './fleet/documents.js';
import { createDatabase } from './database.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

function start() {
  const config = loadConfig(process.env);
  const db = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
  const auth = db && config.supabase ? {
    verify: createSupabaseVerifier(config.supabase.url, config.supabase.key),
    findAdmin: db.findAdmin,
  } : undefined;
  const server = createApp({
    webOrigin: config.webOrigin,
    auth,
    db: db?.db,
    storage: config.supabase && process.env.SUPABASE_STORAGE_KEY
      ? supabaseStorage(config.supabase.url, process.env.SUPABASE_STORAGE_KEY, process.env.SUPABASE_DOCUMENT_BUCKET || 'fuel-feet-documents')
      : undefined,
    maxDocumentBytes: config.maxDocumentBytes,
    databaseReady: db?.checkReady,
  }).listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'API listening');
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    logger.error({ code: error.code, port: config.port }, 'API server error');
    process.exitCode = 1;
  });

  function shutdown() {
    server.close(async (error) => {
      await db?.close().catch(() => { process.exitCode = 1; });
      if (error) {
        logger.error('API shutdown failed');
        process.exitCode = 1;
      }
    });
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

try {
  start();
} catch (error) {
  logger.error(error instanceof Error ? error.message : 'API startup failed');
  process.exitCode = 1;
}
