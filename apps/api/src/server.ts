import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

function start() {
  const config = loadConfig(process.env);
  const server = createApp(config).listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'API listening');
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    logger.error({ code: error.code, port: config.port }, 'API server error');
    process.exitCode = 1;
  });

  function shutdown() {
    server.close((error) => {
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
