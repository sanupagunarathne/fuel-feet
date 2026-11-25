import { httpServerHandler } from 'cloudflare:node';
import { createServer } from 'node:http';
import { registerStdFonts } from 'pdfkit';
import Helvetica from 'pdfkit/standard-fonts/Helvetica';
import HelveticaBold from 'pdfkit/standard-fonts/HelveticaBold';
import { createRuntime } from '../dist/runtime.js';

registerStdFonts(Helvetica, HelveticaBold);

let handler;
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new globalThis.URL(request.url);
    const publicRoute = pathname === '/api/health' || pathname === '/api/ready';
    if (!publicRoute && request.method !== 'OPTIONS') {
      const key = request.headers.get('CF-Connecting-IP') || 'unknown';
      const result = await env.ACCESS_LIMITER.limit({ key });
      if (!result.success) {
        const requestId = globalThis.crypto.randomUUID();
        const headers = {
          'Cache-Control': 'no-store',
          'X-Request-Id': requestId,
          'Retry-After': '60',
          'Vary': 'Origin',
        };
        if (request.headers.get('Origin') === env.WEB_ORIGIN) {
          headers['Access-Control-Allow-Origin'] = env.WEB_ORIGIN;
        }
        return globalThis.Response.json({ error: {
          code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.', requestId,
        } }, { status: 429, headers });
      }
    }

    if (!handler) {
      const { app } = createRuntime({ ...env, NODE_ENV: 'production' }, {
        // A Workers TCP socket cannot be reused across request contexts.
        maxDatabaseConnectionUses: 1,
        accessLimiter: (_request, _response, next) => next(),
      });
      handler = httpServerHandler(createServer(app));
    }
    return handler.fetch(request, env, ctx);
  },
};
