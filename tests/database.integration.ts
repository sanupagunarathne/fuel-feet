import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Client } from 'pg';

test('PostgreSQL enforces the fleet schema with the runtime role', async () => {
  const connectionString = process.env.FUEL_FEET_TEST_DATABASE_URL;
  assert.ok(connectionString, 'Set FUEL_FEET_TEST_DATABASE_URL to an isolated, migrated test database');
  const client = new Client({ connectionString });
  await client.connect();
  const actor = randomUUID();
  const vehicle = randomUUID();
  const secondVehicle = randomUUID();
  const driver = randomUUID();
  const conductor = randomUUID();
  const trip = randomUUID();

  async function reject(sql: string, values: unknown[], code: string) {
    await client.query('SAVEPOINT invalid_operation');
    await assert.rejects(() => client.query(sql, values), { code });
    await client.query('ROLLBACK TO SAVEPOINT invalid_operation');
    await client.query('RELEASE SAVEPOINT invalid_operation');
  }

  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO fuel_feet.user_profiles (id, "authSubject") VALUES ($1, $2)', [actor, randomUUID()]);
    await client.query('SET LOCAL ROLE fuel_feet_runtime');
    await reject('UPDATE fuel_feet.user_profiles SET enabled = true WHERE id = $1', [actor], '42501');
    await client.query('INSERT INTO fuel_feet.vehicles (id, registration) VALUES ($1, $3), ($2, $4)',
      [vehicle, secondVehicle, `TEST-${vehicle}`, `TEST-${secondVehicle}`]);
    await client.query(`INSERT INTO fuel_feet.employees (id, "fullName", role, "defaultRateBps")
      VALUES ($1, 'Synthetic driver', 'DRIVER', 1000), ($2, 'Synthetic conductor', 'CONDUCTOR', 500)`, [driver, conductor]);
    await reject(`INSERT INTO fuel_feet.employees ("fullName", role, "defaultRateBps") VALUES ('Invalid', 'DRIVER', 10001)`,
      [], '23514');
    const assign = `INSERT INTO fuel_feet.vehicle_crew_assignments ("vehicleId", "employeeId", role, "startsOn", "endsBefore")
       VALUES ($1, $2, 'DRIVER', $3, $4)`;
    await client.query(assign, [vehicle, driver, '2026-01-01', '2026-02-01']);
    await client.query(assign, [vehicle, driver, '2026-02-01', null]);
    await reject(assign, [vehicle, driver, '2026-01-17', '2026-02-02'], '23P01');

    await client.query(`INSERT INTO fuel_feet.trip_sheets
      (id, "vehicleId", "createdById", reference, "tripDate", "revenueCents", "driverId", "conductorId")
      VALUES ($1, $2, $3, 'Fixture-001', '2026-01-01', 105, $4, $5)`, [trip, vehicle, actor, driver, conductor]);
    await reject(`INSERT INTO fuel_feet.trip_sheets ("vehicleId", "createdById", reference, "tripDate", "revenueCents")
      VALUES ($1, $2, ' fixture-001 ', '2026-01-01', 0)`, [vehicle, actor], '23505');

    await client.query(`UPDATE fuel_feet.trip_sheets SET status='CONFIRMED', basis='GROSS',
      "basisCents"=105, "policyVersion"=1 WHERE id=$1`, [trip]);
    await reject('SET CONSTRAINTS ALL IMMEDIATE', [], '23514');
    await client.query(`INSERT INTO fuel_feet.trip_earnings ("tripId", "employeeId", role, "rateBps", "amountCents")
      VALUES ($1, $2, 'DRIVER', 1000, 11), ($1, $3, 'CONDUCTOR', 500, 5)`, [trip, driver, conductor]);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await reject('UPDATE fuel_feet.trip_earnings SET "amountCents"=10 WHERE "tripId"=$1 AND role=\'DRIVER\'', [trip], '23514');

    await reject(`INSERT INTO fuel_feet.vehicle_expenses ("vehicleId", "tripId", "createdById", "expenseDate", category, "amountCents")
      VALUES ($1, $2, $3, '2026-01-01', 'HIGHWAY_BILLS', 500)`, [secondVehicle, trip, actor], '23503');
    await reject(`INSERT INTO fuel_feet.salary_payments ("employeeId", "createdById", "earningsMonth", "paidOn", "amountCents")
      VALUES ($1, $2, '2026-01-15', '2026-02-01', 500)`, [driver, actor], '23514');
    await reject('DELETE FROM fuel_feet.vehicles WHERE id = $1', [vehicle], '42501');
    await reject('UPDATE fuel_feet.audit_log SET reason = $1', ['tampering'], '42501');
  } finally {
    try {
      await client.query('ROLLBACK');
      const result = await client.query('SELECT id FROM fuel_feet.vehicles WHERE id = $1', [vehicle]);
      assert.equal(result.rowCount, 0);
    } finally {
      await client.end();
    }
  }
});
