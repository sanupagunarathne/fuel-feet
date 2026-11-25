import type { RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';
import { adminProfileSchema, apiErrorResponseSchema } from '@fuel-feet/shared';
import type { AdminProfile } from '@fuel-feet/shared';
import { z } from 'zod';
import { logger } from './logger.js';

const claimsSchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  aud: z.union([z.literal('authenticated'), z.array(z.string()).refine((aud) => aud.includes('authenticated'))]),
  iss: z.string(),
  exp: z.number().int(),
  aal: z.enum(['aal1', 'aal2']),
});

type Identity = { subject: string; assurance: 'aal1' | 'aal2' };

export type AuthDependencies = {
  verify: (token: string) => Promise<Identity | null>;
  requireMfa?: boolean;
  findAdmin: (subject: string) => Promise<AdminProfile | null>;
};

export function createSupabaseVerifier(url: string, key: string): AuthDependencies['verify'] {
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
  });
  const issuer = new URL('/auth/v1', url).toString();

  return async (token) => {
    // Validate the full token with the configured Auth service before trusting its payload.
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      if (!error.status || error.status >= 500) throw new Error('Identity provider unavailable');
      return null;
    }

    const encoded = token.split('.')[1];
    if (!encoded) return null;
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      return null;
    }

    const claims = claimsSchema.safeParse(payload);
    if (!claims.success || claims.data.sub !== data.user.id || claims.data.iss !== issuer
      || claims.data.exp <= Date.now() / 1000) return null;

    return { subject: claims.data.sub, assurance: claims.data.aal };
  };
}

export function requireAdmin(auth?: AuthDependencies): RequestHandler<
  Record<string, string>, unknown, unknown, unknown, { admin: AdminProfile }
> {
  return async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');

    const deny = (status: number, code: string, message: string) => {
      const requestId = response.get('X-Request-Id');
      logger.info({ requestId, code }, 'Access denied');
      response.status(status).json(apiErrorResponseSchema.parse({ error: { code, message, requestId } }));
    };

    if (!auth) {
      deny(503, 'AUTH_UNAVAILABLE', 'Sign-in is unavailable.');
      return;
    }

    const token = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(request.get('Authorization') ?? '')?.[1];
    if (!token || token.length > 8192) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      deny(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      return;
    }

    try {
      const identity = await auth.verify(token);
      if (!identity) {
        response.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
        deny(401, 'UNAUTHENTICATED', 'Sign in again to continue.');
        return;
      }
      const admin = await auth.findAdmin(identity.subject);
      if (!admin) {
        deny(403, 'ACCESS_DENIED', 'This account does not have workspace access.');
        return;
      }
      if (auth.requireMfa !== false && identity.assurance !== 'aal2') {
        deny(403, 'MFA_REQUIRED', 'Complete two-factor verification to continue.');
        return;
      }
      response.locals.admin = adminProfileSchema.parse(admin);
    } catch {
      deny(503, 'AUTH_UNAVAILABLE', 'Sign-in verification is unavailable. Try again shortly.');
      return;
    }
    next();
  };
}
