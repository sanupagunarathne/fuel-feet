import { fuelAmount, fuelPriceFor } from './rates.js';
import type { Router } from 'express';
import { and, asc, desc, eq, getTableColumns, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { crewInput, crewRoles, distributorInput, employeeInput, expenseCategories, expenseInput,
  paymentInput, reasonInput, settingsInput, vehicleInput, versionInput } from '@fuel-feet/shared';
import { companySettings, distributors, employees, salaryPayments, tripSheets, vehicleCrewAssignments, vehicleExpenses, vehicles } from '../db/schema.js';
import { cents, conflict, dateRange, filterQuery, id, invalid, mutate, period, recordAudit, requestContext, requireRow, send } from './common.js';
import type { Database } from './common.js';

const searchQuery = filterQuery.extend({
  search: z.string().trim().max(100).optional(), active: z.enum(['true', 'false']).optional(),
  role: z.enum(crewRoles).optional(),
});

function searchTerm(input?: string) {
  return input ? `%${input.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : undefined;
}

export function recordsRoutes(router: Router, db: Database) {
  router.get('/vehicles', async (req, res) => {
    const q = searchQuery.parse(req.query);
    const term = searchTerm(q.search);
    send(res, await db.select().from(vehicles).where(and(
      q.active ? eq(vehicles.active, q.active === 'true') : undefined,
      term ? or(ilike(vehicles.registration, term), ilike(vehicles.nickname, term)) : undefined,
    )).orderBy(asc(vehicles.registration), asc(vehicles.id)).limit(q.limit).offset(q.offset));
  });

  router.get('/employees', async (req, res) => {
    const q = searchQuery.parse(req.query);
    const term = searchTerm(q.search);
    const assignedVehicles = sql<string | null>`(
      SELECT string_agg(v.registration, ', ' ORDER BY v.registration)
      FROM fuel_feet.vehicle_crew_assignments a JOIN fuel_feet.vehicles v ON v.id = a."vehicleId"
      WHERE a."employeeId" = employees.id AND v.active
        AND a."startsOn" <= (now() AT TIME ZONE 'Asia/Colombo')::date
        AND (a."endsBefore" IS NULL OR a."endsBefore" > (now() AT TIME ZONE 'Asia/Colombo')::date)
    )`;
    send(res, await db.select({ ...getTableColumns(employees), assignedVehicles }).from(employees).where(and(
      q.active ? eq(employees.active, q.active === 'true') : undefined,
      q.role ? eq(employees.role, q.role) : undefined,
      term ? ilike(employees.fullName, term) : undefined,
    )).orderBy(asc(employees.fullName), asc(employees.id)).limit(q.limit).offset(q.offset));
  });

  router.get('/distributors', async (req, res) => {
    const q = searchQuery.parse(req.query);
    send(res, await db.select().from(distributors).orderBy(asc(distributors.name), asc(distributors.id))
      .limit(q.limit).offset(q.offset));
  });

  for (const [path, table, schema] of [
    ['vehicles', vehicles, vehicleInput],
    ['employees', employees, employeeInput],
    ['distributors', distributors, distributorInput],
  ] as const) {
    // The shared shape is used for retrieval, while the insert/update values are
    // parsed by the schema paired with each table.
    router.get(`/${path}/:id`, async (req, res) => send(res,
      requireRow((await db.select().from(table).where(eq(table.id, id(req.params.id))))[0], 'Record')));

    for (const update of [false, true]) {
      router[update ? 'patch' : 'post'](`/${path}${update ? '/:id' : ''}`, async (req, res) => {
        const values = schema.parse(update ? req.body?.record : req.body);
        const targetId = update ? id('id' in req.params ? req.params.id : undefined) : null;
        const expected = update ? z.iso.datetime().parse(req.body?.updatedAt) : null;
        const ctx = requestContext(req, res);
        const result = await mutate(db, ctx, `${path}-${update ? 'update' : 'create'}`, { values, targetId, expected }, async (tx) => {
          const before = targetId ? requireRow((await tx.select().from(table).where(eq(table.id, targetId)).for('update'))[0], 'Record') : null;
          if (before && before.updatedAt.toISOString() !== expected) conflict('Reload the current record before editing.');
          if (before && 'role' in before && 'role' in values && before.role !== values.role) {
            invalid('Create a separate employee record for a different crew role.');
          }
          const [after] = targetId
            ? await tx.update(table).set(values).where(eq(table.id, targetId)).returning()
            : await tx.insert(table).values({ ...values, ...(path === 'employees' ? { defaultRateBps: ('defaultRateBps' in values ? values.defaultRateBps : undefined) ?? 0 } : {}) }).returning();
          const row = requireRow(after, 'Record');
          await recordAudit(tx, ctx, path, update ? 'update' : 'create', row.id, before, row);
          return row.id;
        });
        send(res, requireRow((await db.select().from(table).where(eq(table.id, result)))[0], 'Record'), update ? 200 : 201);
      });
    }
  }

  router.get('/vehicles/:id/crew', async (req, res) => {
    send(res, await db.select().from(vehicleCrewAssignments).where(eq(vehicleCrewAssignments.vehicleId, id(req.params.id)))
      .orderBy(desc(vehicleCrewAssignments.startsOn), asc(vehicleCrewAssignments.role)));
  });

  router.put('/vehicles/:id/crew', async (req, res) => {
    const vehicleId = id(req.params.id);
    const body = crewInput.parse(req.body);
    const ctx = requestContext(req, res);
    await mutate(db, ctx, 'assign-crew', { vehicleId, body }, async (tx) => {
      const vehicle = requireRow((await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update'))[0], 'Vehicle');
      if (!vehicle.active) invalid('Choose an active vehicle.');
      const history = await tx.select().from(vehicleCrewAssignments).where(eq(vehicleCrewAssignments.vehicleId, vehicleId));
      if (history.some((entry) => entry.startsOn >= body.startsOn || (entry.endsBefore && entry.endsBefore > body.startsOn))) {
        conflict('Choose a date after existing crew changes.');
      }
      const current = history.filter((entry) => entry.endsBefore === null);
      const saved = [];
      for (const [role, employeeId] of [['DRIVER', body.driverId], ['CONDUCTOR', body.conductorId]] as const) {
        const existing = current.find((entry) => entry.role === role);
        if (existing?.employeeId === employeeId) continue;
        if (existing) {
          await tx.update(vehicleCrewAssignments).set({ endsBefore: body.startsOn })
            .where(and(eq(vehicleCrewAssignments.id, existing.id), isNull(vehicleCrewAssignments.endsBefore)));
        }
        if (!employeeId) continue;
        const employee = requireRow((await tx.select().from(employees).where(eq(employees.id, employeeId)).for('share'))[0], 'Employee');
        if (!employee.active || employee.role !== role) invalid(`Choose an active ${role.toLowerCase()}.`);
        const [entry] = await tx.insert(vehicleCrewAssignments).values({ vehicleId, employeeId, role, startsOn: body.startsOn }).returning();
        saved.push(entry);
      }
      await recordAudit(tx, ctx, 'crew', 'assign', vehicleId, current, { ...body, assignments: saved });
      return vehicleId;
    });
    send(res, { id: vehicleId });
  });

  router.get('/expenses', async (req, res) => {
    const q = searchQuery.extend({ category: z.enum(expenseCategories).optional() }).parse(req.query);
    const term = searchTerm(q.search);
    send(res, await db.select().from(vehicleExpenses).where(and(dateRange(vehicleExpenses.expenseDate, period(q)),
      q.vehicleId ? eq(vehicleExpenses.vehicleId, q.vehicleId) : undefined, q.category ? eq(vehicleExpenses.category, q.category) : undefined,
      term ? ilike(vehicleExpenses.description, term) : undefined,
    )).orderBy(desc(vehicleExpenses.expenseDate), asc(vehicleExpenses.id)).limit(q.limit).offset(q.offset));
  });
  router.get('/expenses/:id', async (req, res) => send(res, requireRow(
    (await db.select().from(vehicleExpenses).where(eq(vehicleExpenses.id, id(req.params.id))))[0], 'Expense')));

  const expenseEdit = z.strictObject({ expense: expenseInput, version: versionInput, reason: reasonInput });
  for (const operation of ['create', 'correct', 'void'] as const) {
    const path = operation === 'create' ? '/expenses' : operation === 'correct' ? '/expenses/:id' : '/expenses/:id/void';
    router[operation === 'correct' ? 'patch' : 'post'](path, async (req, res) => {
      const targetId = operation === 'create' ? null : id('id' in req.params ? req.params.id : undefined);
      const edit = operation === 'correct' ? expenseEdit.parse(req.body) : null;
      const voiding = operation === 'void' ? expenseEdit.pick({ version: true, reason: true }).parse(req.body) : null;
      const input = operation === 'create' ? expenseInput.parse(req.body) : edit?.expense;
      const metadata = edit ?? voiding;
      const ctx = requestContext(req, res);
      const result = await mutate(db, ctx, `expense-${operation}`, { targetId, input, metadata }, async (tx) => {
        const before = targetId ? requireRow((await tx.select().from(vehicleExpenses).where(eq(vehicleExpenses.id, targetId)).for('update'))[0], 'Expense') : null;
        if (before && (before.version !== metadata?.version || before.voided)) conflict('Reload the expense before editing.');
        if (input && before && (input.category === 'FUEL') !== (before.category === 'FUEL')) {
          invalid('Use the original expense type when editing.');
        }
        const tripId = input && input.category !== 'FUEL' ? input.tripId : null;
        if (tripId) {
          const [trip] = await tx.select({ id: tripSheets.id }).from(tripSheets)
            .where(and(eq(tripSheets.id, tripId), eq(tripSheets.discarded, false))).for('share');
          if (!trip) invalid('Choose an available trip.');
        }
        let expenseId = targetId;
        if (input) {
          const cost = input.category === 'FUEL'
            ? await (async () => {
              const price = before?.expenseDate === input.expenseDate && before.fuelPriceCentsPerLitre !== null
                ? before.fuelPriceCentsPerLitre : await fuelPriceFor(tx, input.expenseDate);
              return { fuelLitres: input.fuelLitres, fuelPriceCentsPerLitre: price, amountCents: fuelAmount(input.fuelLitres, price) };
            })()
            : { amountCents: cents(input.amount) };
          const fields = {
            vehicleId: input.vehicleId, tripId, expenseDate: input.expenseDate,
            category: input.category, description: input.description, ...cost,
          };
          if (before) {
            await tx.update(vehicleExpenses).set({ ...fields, version: before.version + 1 }).where(eq(vehicleExpenses.id, before.id));
          } else {
            const [row] = await tx.insert(vehicleExpenses).values({ ...fields, createdById: ctx.actorId }).returning();
            expenseId = requireRow(row, 'Expense').id;
          }
        } else if (before) {
          await tx.update(vehicleExpenses).set({ voided: true, version: before.version + 1 }).where(eq(vehicleExpenses.id, before.id));
        }
        const after = requireRow((await tx.select().from(vehicleExpenses).where(eq(vehicleExpenses.id, expenseId!)))[0], 'Expense');
        await recordAudit(tx, ctx, 'expense', operation, after.id, before, after, metadata?.reason);
        return after.id;
      });
      send(res, requireRow((await db.select().from(vehicleExpenses).where(eq(vehicleExpenses.id, result)))[0], 'Expense'),
        targetId ? 200 : 201);
    });
  }

  router.get('/salary-payments', async (req, res) => {
    const q = filterQuery.parse(req.query);
    send(res, await db.select().from(salaryPayments).where(and(
      q.from || q.toExclusive ? dateRange(salaryPayments.paidOn, period(q)) : eq(salaryPayments.earningsMonth, period(q).from),
      q.employeeId ? eq(salaryPayments.employeeId, q.employeeId) : undefined,
    )).orderBy(desc(salaryPayments.paidOn), asc(salaryPayments.id)).limit(q.limit).offset(q.offset));
  });

  router.post('/salary-payments', async (req, res) => {
    const body = paymentInput.parse(req.body);
    const ctx = requestContext(req, res);
    const value = cents(body.amount);
    if (value === 0n) invalid('Enter a positive payment amount.');
    if (body.advance && body.earningsMonth !== body.paidOn.slice(0, 7)) invalid('An advance belongs to the month it was paid.');
    const paymentId = await mutate(db, ctx, 'salary-payment', body, async (tx) => {
      if (body.replacesId) {
        const previous = requireRow((await tx.select().from(salaryPayments).where(eq(salaryPayments.id, body.replacesId)).for('update'))[0], 'Payment');
        if (previous.status !== 'REVERSED' || previous.employeeId !== body.employeeId || previous.advance !== body.advance) invalid('Choose a reversed payment of the same type for the same employee.');
      }
      const row = requireRow((await tx.insert(salaryPayments).values({
        employeeId: body.employeeId, paidOn: body.paidOn, advance: body.advance, reference: body.reference, notes: body.notes, replacesId: body.replacesId,
        earningsMonth: `${body.earningsMonth}-01`, amountCents: value, createdById: ctx.actorId,
      }).returning())[0], 'Payment');
      await recordAudit(tx, ctx, body.advance ? 'advance' : 'payment', 'record', row.id, null, row);
      return row.id;
    });
    send(res, requireRow((await db.select().from(salaryPayments).where(eq(salaryPayments.id, paymentId)))[0], 'Payment'), 201);
  });

  router.post('/salary-payments/:id/reverse', async (req, res) => {
    const paymentId = id(req.params.id);
    const { reason } = z.strictObject({ reason: reasonInput }).parse(req.body);
    const ctx = requestContext(req, res);
    await mutate(db, ctx, 'reverse-payment', { paymentId, reason }, async (tx) => {
      const before = requireRow((await tx.select().from(salaryPayments).where(eq(salaryPayments.id, paymentId)).for('update'))[0], 'Payment');
      if (before.status !== 'RECORDED') conflict('This payment is already reversed.');
      const [after] = await tx.update(salaryPayments).set({
        status: 'REVERSED', reversedById: ctx.actorId, reversedAt: new Date(), reversalReason: reason,
      }).where(eq(salaryPayments.id, paymentId)).returning();
      await recordAudit(tx, ctx, before.advance ? 'advance' : 'payment', 'reverse', paymentId, before, after, reason);
      return paymentId;
    });
    send(res, { id: paymentId });
  });

  router.get('/settings', async (_req, res) => send(res, (await db.select().from(companySettings).where(eq(companySettings.id, 1)))[0] ?? null));
  router.patch('/settings', async (req, res) => {
    const body = settingsInput.parse(req.body);
    const ctx = requestContext(req, res);
    await mutate(db, ctx, 'settings', body, async (tx) => {
      // Lock the singleton even on initial setup.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('fuel_feet.company_settings'))`);
      const [before] = await tx.select().from(companySettings).where(eq(companySettings.id, 1));
      const [after] = await tx.insert(companySettings).values(body).onConflictDoUpdate({ target: companySettings.id, set: body }).returning();
      await recordAudit(tx, ctx, 'settings', 'save', '1', before ?? null, after);
      return '1';
    });
    send(res, (await db.select().from(companySettings).where(eq(companySettings.id, 1)))[0]);
  });
}
