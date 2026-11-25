import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { tripRateSchedules, userProfiles } from './db/schema.js';
import { logger } from './logger.js';

export function createDatabase(connectionString: string, maxUses?: number) {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    max: 5,
    maxUses,
  });
  pool.on('error', () => logger.error('Idle database connection failed'));
  const db = drizzle(pool);

  return {
    db,
    async findAdmin(subject: string) {
      const [profile] = await db.select({ id: userProfiles.id, role: userProfiles.role })
        .from(userProfiles)
        .where(and(eq(userProfiles.authSubject, subject), eq(userProfiles.enabled, true), eq(userProfiles.role, 'ADMIN')))
        .limit(1);
      return profile ?? null;
    },
    async checkReady() {
      await db.select({ id: userProfiles.id }).from(userProfiles).limit(1);
      await db.select({ month: tripRateSchedules.effectiveMonth }).from(tripRateSchedules).limit(1);
    },
    close: () => pool.end(),
  };
}
