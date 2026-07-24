import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const originalProcessEnvironment = { ...process.env };
const safeMongoUri =
  'mongodb+srv://placeholder-user:placeholder-password@cluster.example.mongodb.net/client_management_portal';

let applicationEnvironment;
let applicationName;

beforeAll(async () => {
  process.env = {
    ...originalProcessEnvironment,
    NODE_ENV: 'development',
    PORT: '5000',
    MONGO_URI: safeMongoUri,
    DNS_SERVERS: '',
    CLIENT_URL: 'http://localhost:5173',
  };
  vi.resetModules();

  ({ applicationEnvironment, applicationName } = await import('../src/config/application.js'));
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
