import { sql } from 'drizzle-orm';
import {
  bigint, boolean, char, date, foreignKey, index, integer, jsonb, numeric, pgSchema,
  primaryKey, text, timestamp, unique, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

export const fleetSchema = pgSchema('fuel_feet');

export const userRole = fleetSchema.enum('UserRole', ['ADMIN']);

export const crewRole = fleetSchema.enum('CrewRole', ['DRIVER', 'CONDUCTOR']);

export const tripStatus = fleetSchema.enum('TripStatus', ['DRAFT', 'CONFIRMED', 'VOIDED']);

export const earningsBasis = fleetSchema.enum('EarningsBasis', ['GROSS', 'ADJUSTED']);

export const expenseCategory = fleetSchema.enum('ExpenseCategory', ['MAINTENANCE', 'REPAIRS', 'HIGHWAY_BILLS']);

export const paymentStatus = fleetSchema.enum('PaymentStatus', ['RECORDED', 'REVERSED']);

export const attachmentStatus = fleetSchema.enum('AttachmentStatus', ['STAGED', 'READY', 'RETAINED']);

export const userProfiles = fleetSchema.table('user_profiles', {
  id: uuid().primaryKey().defaultRandom(),
  authSubject: uuid().notNull().unique(),
  role: userRole().notNull().default('ADMIN'),
  enabled: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const vehicles = fleetSchema.table('vehicles', {
  id: uuid().primaryKey().defaultRandom(),
  registration: text().notNull().unique(),
  nickname: text(),
  make: text(),
  model: text(),
  year: integer(),
  notes: text(),
  active: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const employees = fleetSchema.table('employees', {
  id: uuid().primaryKey().defaultRandom(),
  fullName: text().notNull(),
  role: crewRole().notNull(),
  phone: text(),
  defaultRateBps: integer().notNull(),
  active: boolean().notNull().default(true),
  notes: text(),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique().on(table.id, table.role),
]);

export const vehicleCrewAssignments = fleetSchema.table('vehicle_crew_assignments', {
  id: uuid().primaryKey().defaultRandom(),
  vehicleId: uuid().notNull(),
  employeeId: uuid().notNull(),
  role: crewRole().notNull(),
  startsOn: date().notNull(),
  endsBefore: date(),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  foreignKey({ columns: [table.vehicleId], foreignColumns: [vehicles.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.employeeId, table.role], foreignColumns: [employees.id, employees.role] }).onDelete('restrict').onUpdate('restrict'),
  index().on(table.vehicleId, table.startsOn),
  index().on(table.employeeId, table.startsOn),
]);

export const distributors = fleetSchema.table('distributors', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  active: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tripRateSchedules = fleetSchema.table('trip_rate_schedules', {
  effectiveMonth: date().primaryKey(),
  iocTariff: numeric({ precision: 18, scale: 12 }).notNull(),
  driverCentsPerKm: bigint({ mode: 'bigint' }).notNull(),
  conductorCentsPerKm: bigint({ mode: 'bigint' }).notNull(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tripSheets = fleetSchema.table('trip_sheets', {
  id: uuid().primaryKey().defaultRandom(),
  vehicleId: uuid().notNull(),
  driverId: uuid(),
  conductorId: uuid(),
  distributorId: uuid(),
  createdById: uuid().notNull(),
  reference: text().notNull(),
  tripDate: date().notNull(),
  origin: text(),
  destination: text(),
  loadedDistanceKm: numeric({ precision: 9, scale: 3 }),
  iocTariff: numeric({ precision: 18, scale: 12 }),
  rateEffectiveMonth: date(),
  revenueCents: bigint({ mode: 'bigint' }).notNull(),
  basis: earningsBasis(),
  basisCents: bigint({ mode: 'bigint' }),
  adjustmentReason: text(),
  policyVersion: integer(),
  notes: text(),
  status: tripStatus().notNull().default('DRAFT'),
  discarded: boolean().notNull().default(false),
  version: integer().notNull().default(1),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  foreignKey({ columns: [table.vehicleId], foreignColumns: [vehicles.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.driverId], foreignColumns: [employees.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.conductorId], foreignColumns: [employees.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.distributorId], foreignColumns: [distributors.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.createdById], foreignColumns: [userProfiles.id] }).onDelete('restrict').onUpdate('restrict'),
  unique().on(table.id, table.vehicleId),
  index().on(table.status, table.tripDate),
  index().on(table.vehicleId, table.tripDate),
  index().on(table.driverId, table.tripDate),
  index().on(table.conductorId, table.tripDate),
]);

export const tripEarnings = fleetSchema.table('trip_earnings', {
  id: uuid().primaryKey().defaultRandom(),
  tripId: uuid().notNull(),
  employeeId: uuid().notNull(),
  role: crewRole().notNull(),
  rateBps: integer(),
  ratePerKmCents: bigint({ mode: 'bigint' }),
  amountCents: bigint({ mode: 'bigint' }).notNull(),
  rounding: text().notNull().default('HALF_UP'),
}, (table) => [
  foreignKey({ columns: [table.tripId], foreignColumns: [tripSheets.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.employeeId, table.role], foreignColumns: [employees.id, employees.role] }).onDelete('restrict').onUpdate('restrict'),
  unique().on(table.tripId, table.role),
  index().on(table.employeeId, table.tripId),
]);

export const vehicleExpenses = fleetSchema.table('vehicle_expenses', {
  id: uuid().primaryKey().defaultRandom(),
  vehicleId: uuid().notNull(),
  tripId: uuid(),
  createdById: uuid().notNull(),
  expenseDate: date().notNull(),
  category: expenseCategory().notNull(),
  amountCents: bigint({ mode: 'bigint' }).notNull(),
  description: text(),
  voided: boolean().notNull().default(false),
  version: integer().notNull().default(1),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  foreignKey({ columns: [table.vehicleId], foreignColumns: [vehicles.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.tripId, table.vehicleId], foreignColumns: [tripSheets.id, tripSheets.vehicleId] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.createdById], foreignColumns: [userProfiles.id] }).onDelete('restrict').onUpdate('restrict'),
  index().on(table.expenseDate, table.category),
  index().on(table.vehicleId, table.expenseDate),
  index().on(table.tripId, table.vehicleId),
]);

export const salaryPayments = fleetSchema.table('salary_payments', {
  id: uuid().primaryKey().defaultRandom(),
  employeeId: uuid().notNull(),
  createdById: uuid().notNull(),
  earningsMonth: date().notNull(),
  paidOn: date().notNull(),
  advance: boolean().notNull().default(false),
  amountCents: bigint({ mode: 'bigint' }).notNull(),
  reference: text(),
  notes: text(),
  status: paymentStatus().notNull().default('RECORDED'),
  reversedAt: timestamp({ withTimezone: true, precision: 3 }),
  reversedById: uuid(),
  reversalReason: text(),
  replacesId: uuid().unique(),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.employeeId], foreignColumns: [employees.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.createdById], foreignColumns: [userProfiles.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.reversedById], foreignColumns: [userProfiles.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.replacesId], foreignColumns: [table.id] }).onDelete('restrict').onUpdate('restrict'),
  index().on(table.employeeId, table.earningsMonth),
  index().on(table.paidOn),
]);

export const documentAttachments = fleetSchema.table('document_attachments', {
  id: uuid().primaryKey().defaultRandom(),
  tripId: uuid(),
  expenseId: uuid(),
  uploadedById: uuid().notNull(),
  objectKey: text().notNull().unique(),
  filename: text().notNull(),
  mediaType: text().notNull(),
  byteSize: integer().notNull(),
  sha256: char({ length: 64 }).notNull(),
  status: attachmentStatus().notNull().default('STAGED'),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  foreignKey({ columns: [table.tripId], foreignColumns: [tripSheets.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.expenseId], foreignColumns: [vehicleExpenses.id] }).onDelete('restrict').onUpdate('restrict'),
  foreignKey({ columns: [table.uploadedById], foreignColumns: [userProfiles.id] }).onDelete('restrict').onUpdate('restrict'),
  uniqueIndex('active_trip_attachment_checksum').on(table.tripId, table.sha256).where(sql`status <> 'RETAINED'`),
  uniqueIndex('active_expense_attachment_checksum').on(table.expenseId, table.sha256).where(sql`status <> 'RETAINED'`),
  index().on(table.status, table.createdAt),
]);

export const companySettings = fleetSchema.table('company_settings', {
  id: integer().primaryKey().default(1),
  businessName: text().notNull(),
  contact: text(),
  address: text(),
  currency: text().notNull().default('LKR'),
  reportingZone: text().notNull().default('Asia/Colombo'),
  basis: earningsBasis(),
  rounding: text(),
  policyApproved: boolean().notNull().default(false),
  revision: integer().notNull().default(1),
  reportSettings: jsonb().notNull().default({}),
  updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const auditLog = fleetSchema.table('audit_log', {
  id: uuid().primaryKey().defaultRandom(),
  actorId: uuid().notNull(),
  entityType: text().notNull(),
  entityId: text().notNull(),
  operation: text().notNull(),
  reason: text(),
  requestId: uuid().notNull(),
  before: jsonb(),
  after: jsonb(),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.actorId], foreignColumns: [userProfiles.id] }).onDelete('restrict').onUpdate('restrict'),
  index().on(table.entityType, table.entityId, table.createdAt),
]);

export const mutationRequests = fleetSchema.table('mutation_requests', {
  actorId: uuid().notNull(),
  operation: text().notNull(),
  key: text().notNull(),
  payloadDigest: char({ length: 64 }).notNull(),
  resultRef: text().notNull(),
  createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.actorId], foreignColumns: [userProfiles.id] }).onDelete('restrict').onUpdate('restrict'),
  primaryKey({ columns: [table.actorId, table.operation, table.key] }),
]);
