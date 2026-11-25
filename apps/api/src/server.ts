import { createRuntime } from './runtime.js';
import { logger } from './logger.js';

function start() {
  const { app, db, port } = createRuntime(process.env);
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'API listening');
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    logger.error({ code: error.code, port }, 'API server error');
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
