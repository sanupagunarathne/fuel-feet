import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'drizzle-kit';

const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL ?? '' },
  migrations: { schema: 'fuel_feet_migrations' },
  schemaFilter: ['fuel_feet'],
  strict: true,
});
