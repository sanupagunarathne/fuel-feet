import { apiErrorResponseSchema, healthResponseSchema } from '@fuel-feet/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const webOrigin = 'http://localhost:5173';
const app = createApp({ webOrigin });

describe('API foundation', () => {
  it('returns an uncached liveness response using the shared contract', async () => {
    const response = await request(app).get('/api/health').expect(200)
      .expect('Content-Type', /json/)
      .expect('Cache-Control', 'no-store');

    expect(healthResponseSchema.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('grants cross-origin access to the configured web origin', async () => {
    await request(app).get('/api/health').set('Origin', webOrigin)
      .expect('Access-Control-Allow-Origin', webOrigin);
  });

  it('omits cross-origin permission for any other origin', async () => {
    const response = await request(app).get('/api/health')
      .set('Origin', 'https://other.example.test').expect(200);

    expect(response.get('Access-Control-Allow-Origin')).toBeUndefined();
  });

  it('returns a structured 404 with the same request ID as the header', async () => {
    const response = await request(app).get('/api/missing').expect(404);
    const { error } = apiErrorResponseSchema.parse(response.body);

    expect(error.code).toBe('NOT_FOUND');
    expect(error.requestId).toBe(response.get('X-Request-Id'));
  });
});
