import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { AuthDependencies } from './auth.js';

const id = 'cffd10f4-df35-4af9-a080-eb3ec5bda55a';
const auth = (assurance: 'aal1' | 'aal2'): AuthDependencies => ({
  verify: async () => ({ subject: id, assurance }),
  findAdmin: async () => ({ id, role: 'ADMIN' }),
});
const webOrigin = 'http://localhost:5173';
const token = 'Bearer test.identity.signature';

it('rejects missing and unverifiable credentials', async () => {
  const dependency = { ...auth('aal2'), verify: vi.fn().mockResolvedValue(null) };
  const app = createApp({ webOrigin, auth: dependency });
  await request(app).get('/api/me').expect(401);
  expect(dependency.verify).not.toHaveBeenCalled();
  await request(app).get('/api/me').set('Authorization', token).expect(401);
});

it('requires provisioning for accounts at either assurance level', async () => {
  for (const level of ['aal1', 'aal2'] as const) {
    const app = createApp({ webOrigin, auth: { ...auth(level), findAdmin: async () => null } });
    const result = await request(app).get('/api/me').set('Authorization', token).expect(403);
    expect(result.body.error.code).toBe('ACCESS_DENIED');
  }
});

it('requires MFA for a provisioned administrator', async () => {
  const app = createApp({ webOrigin, auth: auth('aal1') });
  const result = await request(app).get('/api/me').set('Authorization', token).expect(403);
  expect(result.body.error.code).toBe('MFA_REQUIRED');
});

it('returns an enabled profile at AAL2 by default', async () => {
  const app = createApp({ webOrigin, auth: auth('aal2') });
  await request(app).get('/api/me').set('Authorization', token).expect('Cache-Control', 'no-store')
    .expect(200, { id, role: 'ADMIN' });
});

it('allows password-only access for a verified, enabled admin when MFA is disabled', async () => {
  const dependency = { ...auth('aal1'), requireMfa: false };
  const app = createApp({ webOrigin, auth: dependency });
  await request(app).get('/api/me').set('Authorization', token).expect(200, { id, role: 'ADMIN' });
  await request(app).get('/api/me').expect(401);
  await request(createApp({ webOrigin, auth: { ...dependency, verify: async () => null } }))
    .get('/api/me').set('Authorization', token).expect(401);
  await request(createApp({ webOrigin, auth: { ...dependency, findAdmin: async () => null } }))
    .get('/api/me').set('Authorization', token).expect(403);
});

it('fails closed when the identity service is unavailable', async () => {
  const app = createApp({
    webOrigin,
    auth: { ...auth('aal2'), verify: async () => { throw new Error('provider offline'); } },
  });
  await request(app).get('/api/me').set('Authorization', token).expect(503);
  await request(createApp({ webOrigin })).get('/api/ready').expect(503, { status: 'unavailable' });
});
