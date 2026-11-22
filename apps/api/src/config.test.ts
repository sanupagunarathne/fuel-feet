import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('API configuration', () => {
  it('provides local defaults', () => {
    expect(loadConfig({})).toEqual({ port: 4000, webOrigin: 'http://localhost:5173' });
  });

  it('accepts an explicit port and web origin', () => {
    expect(loadConfig({ PORT: '4321', WEB_ORIGIN: 'https://app.example.test' }))
      .toEqual({ port: 4321, webOrigin: 'https://app.example.test' });
  });

  it.each([
    { PORT: '65536' },
    { PORT: '' },
    { WEB_ORIGIN: '*' },
    { WEB_ORIGIN: 'https://app.example.test/path' },
  ])('rejects invalid configuration %j', (environment) => {
    expect(() => loadConfig(environment)).toThrow('Invalid API configuration');
  });
});
