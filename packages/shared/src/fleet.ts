import { z } from 'zod';

export const crewRoles = ['DRIVER', 'CONDUCTOR'] as const;
const generalExpenseCategories = ['MAINTENANCE', 'REPAIRS', 'HIGHWAY_BILLS'] as const;
export const expenseCategories = [...generalExpenseCategories, 'FUEL'] as const;
export const moneyInput = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter a rupee amount with up to two decimal places.');
export const monthInput = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
export const distanceInput = z.string().regex(/^\d{1,6}(\.\d{1,3})?$/, 'Enter the one-way distance in km, with up to three decimal places.')
  .refine((value) => /[1-9]/.test(value), 'Enter a positive distance.');
export const tariffInput = z.string().regex(/^\d{1,6}(\.\d{1,12})?$/, 'Enter the exact IOC tariff, with up to 12 decimal places.')
  .refine((value) => /[1-9]/.test(value), 'Enter a positive tariff.');
export const tripRateInput = z.strictObject({
  effectiveMonth: monthInput,
  iocTariff: tariffInput,
  driverPerKm: moneyInput,
  conductorPerKm: moneyInput,
});
const short = z.string().trim().min(1).max(150);
const notes = z.string().trim().max(2000).nullable().default(null);
const choice = z.uuid().nullable().default(null);
export const reasonInput = z.string().trim().min(3).max(500);
export const versionInput = z.number().int().positive();
export const vehicleInput = z.strictObject({
  registration: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  nickname: short.nullable().default(null), make: short.nullable().default(null),
  model: short.nullable().default(null), year: z.number().int().min(1900).max(2100).nullable().default(null),
  active: z.boolean().default(true), notes,
});
export const employeeInput = z.strictObject({
  fullName: short, role: z.enum(crewRoles), phone: z.string().trim().max(40).nullable().default(null),
  defaultRateBps: z.number().int().min(0).max(10000).optional(), active: z.boolean().default(true), notes,
});
export const distributorInput = z.strictObject({ name: short, active: z.boolean().default(true) });
export const crewInput = z.strictObject({
  startsOn: z.iso.date(), driverId: choice, conductorId: choice,
});
const tripDetails = z.strictObject({
  reference: short, vehicleId: z.uuid(), driverId: choice, conductorId: choice, distributorId: choice,
  tripDate: z.iso.date(), origin: short.nullable().default(null), destination: short.nullable().default(null),
  notes,
});
export const tripInput = tripDetails.extend({ loadedDistanceKm: distanceInput });
export const legacyTripInput = tripDetails.extend({
  revenue: moneyInput, adjustedBasis: moneyInput.nullable().default(null),
  adjustmentReason: reasonInput.nullable().default(null),
});
const expenseDetails = z.strictObject({
  vehicleId: z.uuid(), expenseDate: z.iso.date(), description: notes,
});
export const expenseInput = z.union([
  expenseDetails.extend({ tripId: choice, category: z.enum(generalExpenseCategories), amount: moneyInput }),
  expenseDetails.extend({
    category: z.literal('FUEL'),
    fuelLitres: z.string().regex(/^\d{1,6}(\.\d{1,3})?$/, 'Enter litres with up to three decimal places.')
      .refine((value) => /[1-9]/.test(value), 'Enter positive litres.'),
  }),
]);
export const fuelPriceInput = z.strictObject({
  effectiveDate: z.iso.date(),
  pricePerLitre: moneyInput.refine((value) => /^\d{1,6}(\.\d{1,2})?$/.test(value) && /[1-9]/.test(value),
    'Enter a positive fuel price below 1,000,000 LKR per litre.'),
});
export const paymentInput = z.strictObject({
  employeeId: z.uuid(), earningsMonth: monthInput, paidOn: z.iso.date(),
  amount: moneyInput, advance: z.boolean().default(false), reference: short.nullable().default(null), notes, replacesId: choice,
});
export const settingsInput = z.strictObject({
  businessName: short, contact: notes, address: notes,
});
