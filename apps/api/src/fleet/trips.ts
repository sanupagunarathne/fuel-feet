import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { legacyTripInput, reasonInput, tripInput, versionInput } from '@fuel-feet/shared';
import { employees, tripEarnings, tripSheets, vehicleCrewAssignments, vehicles } from '../db/schema.js';
import { cents, conflict, dateRange, earnings, filterQuery, id, invalid, jsonSafe, mutate, period, recordAudit, requestContext, requireRow, send } from './common.js';
import type { Database, Transaction } from './common.js';
import { distanceAmounts, fuelLitres, lockRates, ratesFor } from './rates.js';
import type { Router } from 'express';

type Trip = typeof tripSheets.$inferSelect;
type TripInput = z.infer<typeof tripInput>;
type Earning = typeof tripEarnings.$inferSelect;

async function activeVehicle(db: Database | Transaction, vehicleId: string) {
  const vehicle = requireRow((await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)))[0], 'Vehicle');
  if (!vehicle.active) invalid('Choose an active vehicle.');
}

async function crewMember(db: Database | Transaction, employeeId: string | null, role: 'DRIVER' | 'CONDUCTOR', trip: { vehicleId: string; tripDate: string }) {
  if (!employeeId) return null;
  const member = requireRow((await db.select().from(employees).where(eq(employees.id, employeeId)))[0], 'Employee');
  if (member.role !== role) invalid(`Choose a ${role.toLowerCase()}.`);
  if (!member.active) {
    const [assignment] = await db.select({ id: vehicleCrewAssignments.id }).from(vehicleCrewAssignments)
      .where(and(eq(vehicleCrewAssignments.vehicleId, trip.vehicleId), eq(vehicleCrewAssignments.employeeId, employeeId),
        lte(vehicleCrewAssignments.startsOn, trip.tripDate),
        or(isNull(vehicleCrewAssignments.endsBefore), gt(vehicleCrewAssignments.endsBefore, trip.tripDate)))).limit(1);
    if (!assignment) invalid(`Choose an active or historically assigned ${role.toLowerCase()}.`);
  }
  return member;
}

function legacyFields(input: z.infer<typeof legacyTripInput>) {
  const { revenue, adjustedBasis, ...fields } = input;
  if (Boolean(adjustedBasis) !== Boolean(input.adjustmentReason)) invalid('Provide an adjusted amount and reason together.');
  return { ...fields, revenueCents: cents(revenue), basisCents: adjustedBasis === null ? null : cents(adjustedBasis) };
}

function draftFields(input: TripInput) {
  return { ...input, revenueCents: 0n, basis: null, basisCents: null, policyVersion: null, adjustmentReason: null };
}

function calculatePreview<T>(calculation: T) {
  const preview = createHash('sha256').update(JSON.stringify(jsonSafe(calculation))).digest('hex');
  return { ...calculation, preview };
}

async function plan(db: Database | Transaction, input: TripInput, prior?: Trip, snapshots: Earning[] = []) {
  const { driverId, conductorId, loadedDistanceKm, tripDate } = input;
  if (!driverId || !conductorId) invalid('Select the actual driver and conductor.');
  if (input.vehicleId !== prior?.vehicleId) await activeVehicle(db, input.vehicleId);
  if (driverId !== prior?.driverId) await crewMember(db, driverId, 'DRIVER', input);
  if (conductorId !== prior?.conductorId) await crewMember(db, conductorId, 'CONDUCTOR', input);

  const sameMonth = prior && prior.tripDate.slice(0, 7) === tripDate.slice(0, 7);
  const rate = sameMonth ? {
    effectiveMonth: prior.rateEffectiveMonth!, iocTariff: prior.iocTariff!,
    driverCentsPerKm: snapshots.find((entry) => entry.role === 'DRIVER')!.ratePerKmCents!,
    conductorCentsPerKm: snapshots.find((entry) => entry.role === 'CONDUCTOR')!.ratePerKmCents!,
  } : await ratesFor(db, tripDate);
  const { revenueCents, driverCents, conductorCents } = distanceAmounts(loadedDistanceKm, rate.iocTariff,
    rate.driverCentsPerKm, rate.conductorCentsPerKm);
  if ([revenueCents, driverCents, conductorCents].some((amount) => amount > 9_223_372_036_854_775_807n)) {
    invalid('The calculated amount is too large.');
  }

  const fields = { ...draftFields(input), revenueCents, iocTariff: rate.iocTariff, rateEffectiveMonth: rate.effectiveMonth };
  return calculatePreview({
    fields, loadedDistanceKm, litres: Number(fuelLitres), revenueCents, iocTariff: rate.iocTariff, effectiveMonth: rate.effectiveMonth,
    entitlements: [
      { role: 'DRIVER' as const, employeeId: driverId, rateBps: null, ratePerKmCents: rate.driverCentsPerKm, amountCents: driverCents },
      { role: 'CONDUCTOR' as const, employeeId: conductorId, rateBps: null, ratePerKmCents: rate.conductorCentsPerKm, amountCents: conductorCents },
    ],
  });
}

async function legacyPlan(db: Database | Transaction, input: z.infer<typeof legacyTripInput>, prior: Trip, snapshots: Earning[]) {
  const fields = legacyFields(input);
  const { driverId, conductorId } = fields;
  if (!driverId || !conductorId) invalid('Select the actual driver and conductor.');
  if (input.vehicleId !== prior.vehicleId) await activeVehicle(db, input.vehicleId);
  if (driverId !== prior.driverId) await crewMember(db, driverId, 'DRIVER', input);
  if (conductorId !== prior.conductorId) await crewMember(db, conductorId, 'CONDUCTOR', input);
  const basis = prior.basis;
  const basisCents = basis === 'GROSS' ? fields.revenueCents : fields.basisCents;
  if (basisCents === null || (basis === 'GROSS' && fields.basisCents !== null)) invalid('Enter an amount for the original trip basis.');
  const entitlements = [{ role: 'DRIVER', employeeId: driverId }, { role: 'CONDUCTOR', employeeId: conductorId }] as const;
  return calculatePreview({
    fields: { ...fields, basis, basisCents, policyVersion: prior.policyVersion },
    basis, basisCents, revenueCents: fields.revenueCents,
    entitlements: entitlements.map((entry) => {
      const rateBps = snapshots.find((snapshot) => snapshot.role === entry.role)!.rateBps!;
      return { ...entry, rateBps, ratePerKmCents: null, amountCents: earnings(basisCents, rateBps) };
    }),
  });
}

async function existingPlan(db: Database | Transaction, row: Trip, proposed: unknown, entries: Earning[]) {
  if (row.status === 'CONFIRMED' && row.loadedDistanceKm === null) {
    const input = proposed ?? {
      ...tripIdentity(row), revenue: rupees(row.revenueCents),
      adjustedBasis: row.basis === 'ADJUSTED' && row.basisCents !== null ? rupees(row.basisCents) : null,
      adjustmentReason: row.adjustmentReason,
    };
    return legacyPlan(db, legacyTripInput.parse(input), row, entries);
  }
  const loadedDistanceKm = row.loadedDistanceKm;
  if (!loadedDistanceKm && !proposed) invalid('Edit this draft and enter the loaded distance first.');
  const input = tripInput.parse(proposed ?? { ...tripIdentity(row), loadedDistanceKm });
  return plan(db, input, row.status === 'CONFIRMED' ? row : undefined, entries);
}

function tripIdentity(row: Trip) {
  const { reference, vehicleId, driverId, conductorId, distributorId, tripDate, origin, destination, notes } = row;
  return { reference, vehicleId, driverId, conductorId, distributorId, tripDate, origin, destination, notes };
}

function rupees(cents: bigint) {
  return cents.toString().padStart(3, '0').replace(/(\d{2})$/, '.$1');
}

const lifecycle = z.strictObject({
  version: versionInput, reason: reasonInput.optional(), preview: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  trip: z.union([tripInput, legacyTripInput]).optional(),
});

export function tripRoutes(router: Router, db: Database) {
  router.get('/trips', async (req, res) => {
    const q = filterQuery.extend({ status: z.enum(['DRAFT', 'CONFIRMED', 'VOIDED']).optional() }).parse(req.query);
    send(res, await db.select().from(tripSheets).where(and(dateRange(tripSheets.tripDate, period(q)),
      q.vehicleId ? eq(tripSheets.vehicleId, q.vehicleId) : undefined,
      q.status ? eq(tripSheets.status, q.status) : undefined,
      q.employeeId ? or(eq(tripSheets.driverId, q.employeeId), eq(tripSheets.conductorId, q.employeeId)) : undefined))
      .orderBy(desc(tripSheets.tripDate), asc(tripSheets.id)).limit(q.limit).offset(q.offset));
  });

  router.get('/trips/default-crew', async (req, res) => {
    const q = z.object({ vehicleId: z.uuid(), date: z.iso.date() }).parse(req.query);
    const crew = await db.select({ employeeId: employees.id, role: employees.role }).from(vehicleCrewAssignments)
      .innerJoin(employees, eq(vehicleCrewAssignments.employeeId, employees.id))
      .where(and(eq(vehicleCrewAssignments.vehicleId, q.vehicleId), lte(vehicleCrewAssignments.startsOn, q.date),
        or(isNull(vehicleCrewAssignments.endsBefore), gt(vehicleCrewAssignments.endsBefore, q.date))));
    send(res, { driverId: crew.find((row) => row.role === 'DRIVER')?.employeeId ?? null,
      conductorId: crew.find((row) => row.role === 'CONDUCTOR')?.employeeId ?? null });
  });

  router.post('/trips/preview', async (req, res) => {
    send(res, await plan(db, tripInput.parse(req.body)));
  });

  async function detail(tripId: string) {
    const trip = requireRow((await db.select().from(tripSheets).where(eq(tripSheets.id, tripId)))[0], 'Trip');
    const entitlements = await db.select().from(tripEarnings).where(eq(tripEarnings.tripId, tripId));
    return { ...trip, entitlements };
  }

  router.get('/trips/:id', async (req, res) => send(res, await detail(id(req.params.id))));

  router.post('/trips', async (req, res) => {
    const input = tripInput.parse(req.body);
    const ctx = requestContext(req, res);
    const tripId = await mutate(db, ctx, 'create-trip', input, async (tx) => {
      await activeVehicle(tx, input.vehicleId);
      await crewMember(tx, input.driverId, 'DRIVER', input);
      await crewMember(tx, input.conductorId, 'CONDUCTOR', input);
      const row = requireRow((await tx.insert(tripSheets).values({ ...draftFields(input), createdById: ctx.actorId })
        .returning())[0], 'Trip');
      await recordAudit(tx, ctx, 'trip', 'create', row.id, null, row);
      return row.id;
    });
    send(res, await detail(tripId), 201);
  });

  router.patch('/trips/:id', async (req, res) => {
    const tripId = id(req.params.id);
    const { trip, version } = z.strictObject({ trip: tripInput, version: versionInput }).parse(req.body);
    const ctx = requestContext(req, res);
    await mutate(db, ctx, 'edit-draft', { tripId, trip, version }, async (tx) => {
      const before = requireRow((await tx.select().from(tripSheets).where(eq(tripSheets.id, tripId)).for('update'))[0], 'Trip');
      if (before.version !== version || before.status !== 'DRAFT') conflict('Reload the draft before editing.');
      if (trip.vehicleId !== before.vehicleId) await activeVehicle(tx, trip.vehicleId);
      if (trip.driverId !== before.driverId) await crewMember(tx, trip.driverId, 'DRIVER', trip);
      if (trip.conductorId !== before.conductorId) await crewMember(tx, trip.conductorId, 'CONDUCTOR', trip);
      const [after] = await tx.update(tripSheets).set({ ...draftFields(trip), version: version + 1 }).where(eq(tripSheets.id, tripId)).returning();
      await recordAudit(tx, ctx, 'trip', 'edit-draft', tripId, before, after);
      return tripId;
    });
    send(res, await detail(tripId));
  });

  router.post('/trips/:id/preview', async (req, res) => {
    const tripId = id(req.params.id);
    const existing = await detail(tripId);
    if (existing.status === 'VOIDED') conflict('Voided trips cannot be edited.');
    send(res, await existingPlan(db, existing, req.body?.trip, existing.entitlements));
  });

  for (const operation of ['confirm', 'correct', 'void'] as const) {
    router.post(`/trips/:id/${operation}`, async (req, res) => {
      const tripId = id(req.params.id);
      const body = lifecycle.parse(req.body);
      if (operation !== 'confirm' && !body.reason) invalid('Enter a reason for this change.');
      if (operation === 'correct' && !body.trip) invalid('Enter the corrected trip details.');
      if (operation !== 'correct' && body.trip) invalid('Save trip details separately before changing status.');
      const ctx = requestContext(req, res);
      await mutate(db, ctx, `trip-${operation}`, { tripId, body }, async (tx) => {
        const before = requireRow((await tx.select().from(tripSheets).where(eq(tripSheets.id, tripId)).for('update'))[0], 'Trip');
        const expected = operation === 'confirm' ? 'DRAFT' : 'CONFIRMED';
        if (before.version !== body.version || before.status !== expected) conflict('Reload the trip before changing it.');
        const previous = await tx.select().from(tripEarnings).where(eq(tripEarnings.tripId, tripId));
        if (operation === 'void') {
          const [after] = await tx.update(tripSheets).set({ status: 'VOIDED', version: before.version + 1 })
            .where(eq(tripSheets.id, tripId)).returning();
          await recordAudit(tx, ctx, 'trip', 'void', tripId, before, after, body.reason);
          return tripId;
        }

        await lockRates(tx);
        const { entitlements, preview, fields } = await existingPlan(tx, before, body.trip, previous);
        if (preview !== body.preview) conflict('Preview and review the latest amounts before saving.');
        const [after] = await tx.update(tripSheets).set({
          ...fields, status: 'CONFIRMED', version: before.version + 1,
        }).where(eq(tripSheets.id, tripId)).returning();
        const savedEarnings = [];
        for (const earning of entitlements) {
          const [entry] = await tx.insert(tripEarnings).values({ tripId, ...earning }).onConflictDoUpdate({
            target: [tripEarnings.tripId, tripEarnings.role], set: earning,
          }).returning();
          savedEarnings.push(entry);
        }
        await recordAudit(tx, ctx, 'trip', operation, tripId, { ...before, entitlements: previous },
          { ...after, entitlements: savedEarnings }, body.reason);
        return tripId;
      });
      send(res, await detail(tripId));
    });
  }
}
