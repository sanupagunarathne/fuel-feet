import { z } from 'zod';

const configSchema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .prefault('4000'),
  WEB_ORIGIN: z
    .url({ protocol: /^https?$/ })
    .refine((value) => URL.parse(value)?.origin === value, 'Use a bare HTTP or HTTPS origin')
    .default('http://localhost:5173'),
  SUPABASE_URL: z.url({ protocol: /^https?$/ })
    .refine((value) => URL.parse(value)?.origin === value, 'Use a bare HTTP or HTTPS origin')
    .optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  REQUIRE_MFA: z.enum(['true', 'false']).default('true'),
  DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1000).max(20_971_520).optional(),
});

export function loadConfig(environment: NodeJS.ProcessEnv) {
  const result = configSchema.safeParse({
    ...environment,
    SUPABASE_URL: environment.SUPABASE_URL || undefined,
    SUPABASE_PUBLISHABLE_KEY: environment.SUPABASE_PUBLISHABLE_KEY || undefined,
    DATABASE_URL: environment.DATABASE_URL || undefined,
    DOCUMENT_MAX_BYTES: environment.DOCUMENT_MAX_BYTES || undefined,
  });
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(`Invalid API configuration: ${names.join(', ')}`);
  }

  const { PORT: port, WEB_ORIGIN: webOrigin, SUPABASE_URL: authUrl,
    SUPABASE_PUBLISHABLE_KEY: authKey, DATABASE_URL: databaseUrl } = result.data;
  if (Boolean(authUrl) !== Boolean(authKey)) {
    throw new Error('Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY together');
  }
  if (environment.NODE_ENV === 'production' && (!authUrl || !databaseUrl)) {
    throw new Error('Production requires Supabase Auth and a runtime database connection');
  }
  if (environment.NODE_ENV === 'production' && !authUrl?.startsWith('https://')) {
    throw new Error('Production requires an HTTPS Supabase URL');
  }

  return {
    port, webOrigin, requireMfa: result.data.REQUIRE_MFA === 'true',
    ...(authUrl && authKey ? { supabase: { url: authUrl, key: authKey } } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(result.data.DOCUMENT_MAX_BYTES ? { maxDocumentBytes: result.data.DOCUMENT_MAX_BYTES } : {}),
  };
}
