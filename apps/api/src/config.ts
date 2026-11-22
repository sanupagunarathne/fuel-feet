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
});

export function loadConfig(environment: NodeJS.ProcessEnv) {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(`Invalid API configuration: ${names.join(', ')}`);
  }

  return { port: result.data.PORT, webOrigin: result.data.WEB_ORIGIN };
}
