import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const originalProcessEnvironment = { ...process.env };

let applicationEnvironment;
let applicationName;

beforeAll(async () => {
  process.env = {
    ...originalProcessEnvironment,
    NODE_ENV: 'development',
    PORT: '5000',
  };
  vi.resetModules();

  ({ applicationEnvironment, applicationName } = await import('../src/index.js'));
});

afterAll(() => {
  process.env = { ...originalProcessEnvironment };
  vi.resetModules();
});

describe('backend foundation', () => {
  it('exports the application name', () => {
    expect(applicationName).toBe('client-management-portal-api');
  });

  it('exports the application environment', () => {
    expect(applicationEnvironment).toBe('development');
  });
});
