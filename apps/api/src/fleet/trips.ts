import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { reasonInput, tripInput, versionInput } from '@fuel-feet/shared';
import { companySettings, employees, tripEarnings, tripSheets, vehicleCrewAssignments, vehicles } from '../db/schema.js';
import { cents, conflict, dateRange, earnings, filterQuery, id, invalid, jsonSafe, mutate, period, recordAudit, requestContext, requireRow, send } from './common.js';
import type { Database, Transaction } from './common.js';
import type { Router } from 'express';

type Trip = typeof tripSheets.$inferSelect;
type TripInput = z.infer<typeof tripInput>;
type Earning = typeof tripEarnings.$inferSelect;

async function activeVehicle(db: Database | Transaction, vehicleId: string) {
  const vehicle = requireRow((await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)))[0], 'Vehicle');
  if (!vehicle.active) invalid('Choose an active vehicle.');
}

async function crewMember(db: Database | Transaction, employeeId: string | null, role: 'DRIVER' | 'CONDUCTOR') {
  if (!employeeId) return null;
  const member = requireRow((await db.select().from(employees).where(eq(employees.id, employeeId)))[0], 'Employee');
  if (!member.active || member.role !== role) invalid(`Choose an active ${role.toLowerCase()}.`);
  return member;
}

export function tripFields(input: TripInput) {
  const { revenue, adjustedBasis, ...fields } = input;
  if (Boolean(adjustedBasis) !== Boolean(input.adjustmentReason)) invalid('Provide an adjusted amount and reason together.');
  return { ...fields, revenueCents: cents(revenue), basisCents: adjustedBasis === null ? null : cents(adjustedBasis) };
}

async function plan(db: Database | Transaction, input: ReturnType<typeof tripFields>, allowProvisional: boolean,
  prior?: Trip, snapshots: Earning[] = []) {
  const [settings] = await db.select().from(companySettings).where(eq(companySettings.id, 1));
  const approved = Boolean(settings?.policyApproved);
  if (!approved && !allowProvisional && !prior) invalid('The owner needs to approve the salary policy before confirmation.');
  if (!input.driverId || !input.conductorId) invalid('Select the actual driver and conductor.');
  if (input.vehicleId !== prior?.vehicleId) await activeVehicle(db, input.vehicleId);

  const basis = prior?.basis ?? (approved ? settings?.basis : 'GROSS');
  if (basis !== 'GROSS' && basis !== 'ADJUSTED') invalid('Configure the salary basis.');
  if (basis === 'ADJUSTED' && (input.basisCents === null || !input.adjustmentReason)) invalid('Enter the approved adjusted amount and a reason.');
  if (basis === 'GROSS' && input.basisCents !== null) invalid('The gross-revenue policy does not accept an adjusted amount.');
  const basisCents = basis === 'GROSS' ? input.revenueCents : input.basisCents!;
  const roles = [{ role: 'DRIVER', employeeId: input.driverId }, { role: 'CONDUCTOR', employeeId: input.conductorId }] as const;
  const entitlements = await Promise.all(roles.map(async ({ role, employeeId }) => {
    const snapshot = snapshots.find((row) => row.role === role && row.employeeId === employeeId);
    const member = snapshot ? null : await crewMember(db, employeeId, role);
    const rateBps = snapshot?.rateBps ?? member!.defaultRateBps;
    return { role, employeeId, rateBps, amountCents: earnings(basisCents, rateBps) };
  }));
  const calculation = { basis, basisCents, policyVersion: prior?.policyVersion ?? (approved ? settings!.revision : 1), entitlements };
  const preview = createHash('sha256').update(JSON.stringify(jsonSafe(calculation))).digest('hex');
  return { ...calculation, preview, provisional: !approved && !prior };
}

function storedInput(trip: Trip) {
  return { ...trip, basisCents: trip.basis === 'GROSS' ? null : trip.basisCents };
}

const lifecycle = z.strictObject({
  version: versionInput, reason: reasonInput.optional(), preview: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  trip: tripInput.optional(),
});

export function tripRoutes(router: Router, db: Database, allowProvisional: boolean) {
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
        or(isNull(vehicleCrewAssignments.endsBefore), gt(vehicleCrewAssignments.endsBefore, q.date)), eq(employees.active, true)));
    send(res, { driverId: crew.find((row) => row.role === 'DRIVER')?.employeeId ?? null,
      conductorId: crew.find((row) => row.role === 'CONDUCTOR')?.employeeId ?? null });
  });

  router.post('/trips/preview', async (req, res) => {
    send(res, await plan(db, tripFields(tripInput.parse(req.body)), allowProvisional));
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
      await crewMember(tx, input.driverId, 'DRIVER');
      await crewMember(tx, input.conductorId, 'CONDUCTOR');
      const row = requireRow((await tx.insert(tripSheets).values({ ...tripFields(input), createdById: ctx.actorId })
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
      if (trip.driverId !== before.driverId) await crewMember(tx, trip.driverId, 'DRIVER');
      if (trip.conductorId !== before.conductorId) await crewMember(tx, trip.conductorId, 'CONDUCTOR');
      const [after] = await tx.update(tripSheets).set({ ...tripFields(trip), version: version + 1 }).where(eq(tripSheets.id, tripId)).returning();
      await recordAudit(tx, ctx, 'trip', 'edit-draft', tripId, before, after);
      return tripId;
    });
    send(res, await detail(tripId));
  });

  router.post('/trips/:id/preview', async (req, res) => {
    const tripId = id(req.params.id);
    const existing = await detail(tripId);
    if (existing.status === 'VOIDED') conflict('Voided trips cannot be edited.');
    const proposed = req.body?.trip === undefined ? storedInput(existing) : tripFields(tripInput.parse(req.body.trip));
    send(res, await plan(db, proposed, allowProvisional,
      existing.status === 'CONFIRMED' ? existing : undefined, existing.entitlements));
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

        const fields = body.trip ? tripFields(body.trip) : storedInput(before);
        const { entitlements, preview, basis, basisCents, policyVersion } =
          await plan(tx, fields, allowProvisional, operation === 'correct' ? before : undefined, previous);
        if (preview !== body.preview) conflict('Preview and review the latest earnings before saving.');
        const update = body.trip ? tripFields(body.trip) : {};
        const [after] = await tx.update(tripSheets).set({
          ...update, basis, basisCents, policyVersion, status: 'CONFIRMED', version: before.version + 1,
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
