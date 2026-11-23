import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './index.js';

describe('health response contract', () => {
  it('validates the liveness response and rejects unknown states', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(healthResponseSchema.safeParse({ status: 'unavailable' }).success).toBe(false);
  });
});
