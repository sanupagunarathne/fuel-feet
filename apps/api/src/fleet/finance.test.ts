import { describe, expect, it } from 'vitest';
import { carryAdvances } from './advances.js';
import { distanceAmounts } from './rates.js';

describe('distance calculations', () => {
  it('uses the loaded leg and the fixed volume', () => {
    expect(distanceAmounts('150', '0.05', 4500n, 4000n)).toEqual({
      revenueCents: 4_950_000n, driverCents: 675_000n, conductorCents: 600_000n,
    });
  });

  it('rounds each result half up without rounding the tariff', () => {
    expect(distanceAmounts('1.005', '0.000000999999', 100n, 200n)).toEqual({
      revenueCents: 1n, driverCents: 101n, conductorCents: 201n,
    });
  });
});

describe('advance carry-forward', () => {
  it('keeps debt through gaps and stops deductions after recovery', () => {
    const employeeId = 'driver';
    const row = (month: string, amount: string) => ({ employeeId, month, amount });
    const advances = [row('2026-04-01', '4500000')];
    const april = row('2026-04-01', '4000000');
    expect(carryAdvances([april], advances).get(employeeId)).toBe(500_000n);
    expect(carryAdvances([row('2026-06-01', '300000'), april], advances).get(employeeId)).toBe(200_000n);
    expect(carryAdvances([april, row('2026-06-01', '800000')], advances).get(employeeId)).toBe(0n);
  });
});
