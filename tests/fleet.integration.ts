import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { Client } from 'pg';
import request from 'supertest';
import { createApp } from '../apps/api/src/app.js';
import { createDatabase } from '../apps/api/src/database.js';
import type { DocumentStorage } from '../apps/api/src/fleet/documents.js';

test('authenticated transactions, reports, exports and private document lifecycle on PostgreSQL', async () => {
  const ownerUrl = process.env.FUEL_FEET_TEST_DATABASE_URL;
  const runtimeUrl = process.env.FUEL_FEET_TEST_RUNTIME_URL;
  assert.ok(ownerUrl && runtimeUrl, 'Set both isolated database test URLs');
  const database = createDatabase(runtimeUrl);
  const actor = randomUUID();
  const owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    await owner.query('INSERT INTO fuel_feet.user_profiles (id, "authSubject", enabled) VALUES ($1, $2, true)', [actor, randomUUID()]);
  } finally { await owner.end(); }

  const objects = new Map<string, Buffer>();
  const storage: DocumentStorage = {
    async put(key, contents) {
      if (objects.has(key)) throw new Error('Duplicate object');
      objects.set(key, contents);
    },
    async read(key) {
      const object = objects.get(key);
      if (!object) throw new Error('Missing object');
      return new Blob([Uint8Array.from(object)]);
    },
  };
  const config = {
    webOrigin: 'http://localhost:5173', db: database.db,
    auth: {
      verify: async (token: string) => token === 'test.admin.token' ? { subject: actor, assurance: 'aal2' as const } : null,
      findAdmin: async () => ({ id: actor, role: 'ADMIN' as const }),
    }, storage, maxDocumentBytes: 1024,
  };
  const api = request(createApp({ ...config, allowProvisional: true }));
  const auth = 'Bearer test.admin.token';
  const get = (path: string) => api.get('/api' + path).set('Authorization', auth);
  const post = (path: string, body: unknown, key = randomUUID()) => api.post('/api' + path)
    .set('Authorization', auth).set('Idempotency-Key', key).send(body as object);
  const patch = (path: string, body: object) => api.patch('/api' + path)
    .set('Authorization', auth).set('Idempotency-Key', randomUUID()).send(body);

  try {
    await api.get('/api/vehicles').expect(401);
    await get('/dashboard/summary?from=2026-01-01').expect(422);
    const external = randomUUID().slice(0, 8);
    const vehicleId = (await post('/vehicles', { registration: `TEST ${external}` }).expect(201)).body.id;
    const otherVehicle = (await post('/vehicles', { registration: `OTHER ${external}` }).expect(201)).body.id;
    const driver = (await post('/employees', { fullName: 'Test driver', role: 'DRIVER', defaultRateBps: 1000 }).expect(201)).body;
    const conductor = (await post('/employees', { fullName: 'Test conductor', role: 'CONDUCTOR', defaultRateBps: 500 }).expect(201)).body;
    const assignments = { startsOn: '2026-04-01', driverId: driver.id, conductorId: conductor.id };
    await api.put(`/api/vehicles/${vehicleId}/crew`).set('Authorization', auth).set('Idempotency-Key', randomUUID()).send(assignments).expect(200);
    const defaults = await get(`/trips/default-crew?vehicleId=${vehicleId}&date=2026-04-30`).expect(200);
    assert.deepEqual(defaults.body, { driverId: driver.id, conductorId: conductor.id });

    const draft = { reference: 'APR-1001', tripDate: '2026-04-30', vehicleId,
      driverId: driver.id, conductorId: conductor.id, revenue: '50000.00' };
    const key = randomUUID();
    const race = await Promise.all([post('/trips', draft, key).expect(201), post('/trips', draft, key).expect(201)]);
    const tripId = race[0].body.id;
    assert.equal(race[1].body.id, tripId);
    await post('/trips', { ...draft, revenue: '99' }, key).expect(409);
    await post('/trips', { ...draft, reference: ' apr-1001 ' }).expect(409);
    await post('/trips', { ...draft, reference: 'OTHER-001', vehicleId: otherVehicle }).expect(201);
    const gated = request(createApp(config));
    await gated.post(`/api/trips/${tripId}/preview`).set('Authorization', auth).send({}).expect(422);
    const preview = (await post(`/trips/${tripId}/preview`, {}).expect(200)).body;
    assert.equal(preview.entitlements[0].amountCents, '500000');
    const changedDriver = await patch(`/employees/${driver.id}`, { updatedAt: driver.updatedAt,
      record: { fullName: 'Test driver', role: 'DRIVER', defaultRateBps: 2000 } }).expect(200);
    assert.equal(changedDriver.body.defaultRateBps, 2000);
    await post(`/trips/${tripId}/confirm`, { version: 1, preview: preview.preview }).expect(409);
    await patch(`/employees/${driver.id}`, { updatedAt: changedDriver.body.updatedAt,
      record: { fullName: 'Test driver', role: 'DRIVER', defaultRateBps: 1000 } }).expect(200);
    await post(`/trips/${tripId}/confirm`, { version: 1, preview: preview.preview }).expect(200);
    const currentDriver = (await get(`/employees/${driver.id}`).expect(200)).body;
    await patch(`/employees/${driver.id}`, { updatedAt: currentDriver.updatedAt,
      record: { fullName: 'Test driver', role: 'DRIVER', defaultRateBps: 2500 } }).expect(200);
    const corrected = { ...draft, reference: 'APR-1002' };
    const correction = (await post(`/trips/${tripId}/preview`, { trip: corrected }).expect(200)).body;
    assert.equal(correction.entitlements[0].rateBps, 1000);
    await post(`/trips/${tripId}/correct`, { version: 2, reason: 'Correct invoice number', trip: corrected, preview: correction.preview }).expect(200);

    const expense = { vehicleId, tripId, expenseDate: '2026-04-30', category: 'HIGHWAY_BILLS', amount: '1000.00' };
    await post('/expenses', { ...expense, vehicleId: otherVehicle }).expect(422);
    await post('/expenses', expense).expect(201);
    const payment = { employeeId: driver.id, paidOn: '2026-05-05', earningsMonth: '2026-04', amount: '6000.00' };
    const payId = (await post('/salary-payments', payment).expect(201)).body.id;
    const balances = await get(`/salaries?month=2026-04&employeeId=${driver.id}`).expect(200);
    assert.equal(balances.body[0].balance, '-100000');
    assert.equal(balances.body[0].status, 'Credit');
    await post(`/salary-payments/${payId}/reverse`, { reason: 'Bank transfer reversed' }).expect(200);
    const summary = (await get(`/dashboard/summary?month=2026-04&vehicleId=${vehicleId}`).expect(200)).body;
    assert.equal(summary.totals.profit, '4150000');
    const may = (await get(`/dashboard/summary?month=2026-05&vehicleId=${vehicleId}`).expect(200)).body;
    assert.equal(may.totals.revenue, '0');

    const report = `/reports/vehicle-profit?month=2026-04&vehicleId=${vehicleId}`;
    const json = (await get(report).expect(200)).body;
    assert.equal(json.rows.at(-1)[10], '4150000');
    const pdf = await get(report + '&format=pdf').buffer(true).parse(binaryParser).expect(200).expect('Content-Type', /application\/pdf/);
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
    const workbook = new ExcelJS.Workbook();
    const xlsx = await get(report + '&format=xlsx').buffer(true).parse(binaryParser).expect(200).expect('Content-Type', /spreadsheetml/);
    await workbook.xlsx.read(Readable.from([xlsx.body]));
    assert.equal(workbook.worksheets[0]?.getCell(6, 11).value, 41500);

    const attachmentPath = `/api/trips/${tripId}/attachments`;
    const upload = (data: Buffer) => api.post(attachmentPath).set('Authorization', auth)
      .set('Idempotency-Key', randomUUID()).attach('file', data, { filename: 'test.pdf', contentType: 'application/pdf' });
    await upload(Buffer.from('incorrect file')).expect(422);
    await upload(Buffer.alloc(2048)).expect(413);
    const syntheticPdf = pdf.body as Buffer;
    const smallPdf = Buffer.from('%PDF-1.4\nsynthetic attachment fixture\n%%EOF');
    assert.ok(syntheticPdf.length > smallPdf.length);
    const document = await upload(smallPdf).expect(201);
    assert.equal((await upload(smallPdf).expect(201)).body.id, document.body.id);
    assert.equal(objects.size, 1);
    await api.get(`/api/attachments/${document.body.id}/download`).expect(401);
    const fetched = await get(`/attachments/${document.body.id}/download`).buffer(true).parse(binaryParser).expect(200);
    assert.deepEqual(fetched.body, smallPdf);
    await post(`/trips/${tripId}/void`, { version: 3, reason: 'Duplicate source trip' }).expect(200);
    const after = (await get(`/dashboard/summary?month=2026-04&vehicleId=${vehicleId}`).expect(200)).body;
    assert.equal(after.totals.profit, '-100000');
    const audit = (await get('/audit?limit=200').expect(200)).body as { entityId: string; operation: string }[];
    assert.equal(audit.filter((entry) => entry.entityId === tripId && entry.operation === 'create').length, 1);
    assert.equal(audit.filter((entry) => entry.entityId === tripId && entry.operation === 'correct').length, 1);
  } finally { await database.close(); }
});

const binaryParser: Parameters<request.Test['parse']>[0] = (response, callback) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error, null));
};
