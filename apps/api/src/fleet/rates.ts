import type { Router } from 'express';
import { desc, eq, gte, lte, and, lt, sql } from 'drizzle-orm';
import { tripRateInput } from '@fuel-feet/shared';
import { tripRateSchedules, tripSheets } from '../db/schema.js';
import { cents, colomboMonth, conflict, invalid, monthStart, mutate, recordAudit, requestContext, requireRow, send } from './common.js';
import type { Database, Transaction } from './common.js';

export const fuelLitres = 6600n;

export function lockRates(tx: Transaction) {
  return tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('fuel_feet.trip_rates'))`);
}

function decimal(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return { value: BigInt(whole! + fraction), divisor: 10n ** BigInt(fraction.length) };
}

export function distanceAmounts(distance: string, iocTariff: string, driverCentsPerKm: bigint, conductorCentsPerKm: bigint) {
  const km = decimal(distance);
  const tariff = decimal(iocTariff);
  const round = (value: bigint, divisor: bigint) => (value * 2n + divisor) / (2n * divisor);
  return {
    revenueCents: round(km.value * tariff.value * fuelLitres * 100n, km.divisor * tariff.divisor),
    driverCents: round(km.value * driverCentsPerKm, km.divisor),
    conductorCents: round(km.value * conductorCentsPerKm, km.divisor),
  };
}

export async function ratesFor(db: Database | Transaction, tripDate: string) {
  const [rate] = await db.select().from(tripRateSchedules).where(lte(tripRateSchedules.effectiveMonth, tripDate))
    .orderBy(desc(tripRateSchedules.effectiveMonth)).limit(1);
  if (!rate) invalid('Set the IOC tariff and crew rates for this trip month in Settings → Rates.');
  return rate;
}

export function rateRoutes(router: Router, db: Database) {
  router.get('/rates', async (_req, res) => send(res, await db.select().from(tripRateSchedules)
    .orderBy(desc(tripRateSchedules.effectiveMonth))));
  router.put('/rates', async (req, res) => {
    const body = tripRateInput.parse(req.body);
    const ctx = requestContext(req, res);
    const effectiveMonth = monthStart(body.effectiveMonth);
    const rate = {
      effectiveMonth, iocTariff: body.iocTariff, driverCentsPerKm: cents(body.driverPerKm),
      conductorCentsPerKm: cents(body.conductorPerKm),
    };
    await mutate(db, ctx, 'schedule-trip-rates', body, async (tx) => {
      await lockRates(tx);
      const schedules = await tx.select().from(tripRateSchedules).orderBy(desc(tripRateSchedules.effectiveMonth));
      const before = schedules.find((entry) => entry.effectiveMonth === effectiveMonth);
      // Historical setup is available until rates have been applied in that window.
      const next = schedules.filter((entry) => entry.effectiveMonth > effectiveMonth).at(-1)?.effectiveMonth;
      const [used] = await tx.select({ id: tripSheets.id }).from(tripSheets).where(and(
        gte(tripSheets.tripDate, effectiveMonth), next ? lt(tripSheets.tripDate, next) : undefined,
        sql`${tripSheets.iocTariff} IS NOT NULL`,
      )).limit(1);
      const coveredPastMonth = effectiveMonth <= colomboMonth() + '-01' &&
        schedules.some((entry) => entry.effectiveMonth <= effectiveMonth);
      const [confirmed] = coveredPastMonth ? await tx.select({ id: tripSheets.id }).from(tripSheets)
        .where(sql`${tripSheets.iocTariff} IS NOT NULL`).limit(1) : [];
      if (used || confirmed) {
        conflict('Those rates are already in effect. Choose a future month.');
      }
      const [after] = await tx.insert(tripRateSchedules).values(rate).onConflictDoUpdate({
        target: tripRateSchedules.effectiveMonth, set: rate,
      }).returning();
      await recordAudit(tx, ctx, 'rates', before ? 'update' : 'schedule', effectiveMonth, before ?? null, after);
      return effectiveMonth;
    });
    send(res, requireRow((await db.select().from(tripRateSchedules)
      .where(eq(tripRateSchedules.effectiveMonth, effectiveMonth)))[0], 'Rate schedule'));
  });
}
