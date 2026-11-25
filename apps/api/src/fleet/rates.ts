import type { Router } from 'express';
import { desc, eq, gte, lte, and, lt, sql } from 'drizzle-orm';
import { fuelPriceInput, tripRateInput } from '@fuel-feet/shared';
import { fuelPrices, tripRateSchedules, tripSheets } from '../db/schema.js';
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

export async function fuelPriceFor(tx: Transaction, expenseDate: string) {
  const [price] = await tx.select().from(fuelPrices).where(lte(fuelPrices.effectiveDate, expenseDate))
    .orderBy(desc(fuelPrices.effectiveDate)).limit(1);
  if (!price) invalid('Set a fuel price effective on or before this date in Settings → Fuel prices.');
  return price.centsPerLitre;
}

export function fuelAmount(litres: string, price: bigint) {
  const volume = decimal(litres);
  return (volume.value * price * 2n + volume.divisor) / (2n * volume.divisor);
}

export function rateRoutes(router: Router, db: Database) {
  router.get('/fuel-prices', async (_req, res) => send(res, await db.select().from(fuelPrices).orderBy(desc(fuelPrices.effectiveDate))));
  router.put('/fuel-prices', async (req, res) => {
    const body = fuelPriceInput.parse(req.body);
    const ctx = requestContext(req, res);
    const price = { effectiveDate: body.effectiveDate, centsPerLitre: cents(body.pricePerLitre) };
    const saved = await mutate(db, ctx, 'set-fuel-price', body, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('fuel_feet.fuel_prices'))`);
      const [before] = await tx.select().from(fuelPrices).where(eq(fuelPrices.effectiveDate, price.effectiveDate));
      const [after] = await tx.insert(fuelPrices).values(price).onConflictDoUpdate({
        target: fuelPrices.effectiveDate, set: price,
      }).returning();
      await recordAudit(tx, ctx, 'fuel-price', 'set', price.effectiveDate, before ?? null, after);
      return price.effectiveDate;
    });
    send(res, requireRow((await db.select().from(fuelPrices).where(eq(fuelPrices.effectiveDate, saved)))[0], 'Fuel price'));
  });
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
