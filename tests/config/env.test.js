import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalProcessEnvironment = { ...process.env };
const safeMongoUri =
  'mongodb+srv://placeholder-user:placeholder-password@cluster.example.mongodb.net/client_management_portal';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

const importEnvironment = async () => {
  vi.resetModules();
  return import('../../src/config/env.js');
};

beforeEach(() => {
  process.env = {
    ...originalProcessEnvironment,
    MONGO_URI: safeMongoUri,
  };
  delete process.env.NODE_ENV;
  delete process.env.PORT;
});

afterEach(() => {
  process.env = { ...originalProcessEnvironment };
  vi.clearAllMocks();
});

describe('environment configuration', () => {
  it('defaults NODE_ENV to development', async () => {
    const { env } = await importEnvironment();

    expect(env.nodeEnv).toBe('development');
  });

  it('defaults PORT to 5000', async () => {
    const { env } = await importEnvironment();

    expect(env.port).toBe(5000);
  });

  it('accepts a valid NODE_ENV', async () => {
    process.env.NODE_ENV = 'development';

    const { env } = await importEnvironment();

    expect(env.nodeEnv).toBe('development');
  });

  it('converts a valid PORT string to a number', async () => {
    process.env.PORT = '8080';

    const { env } = await importEnvironment();

    expect(env.port).toBe(8080);
    expect(typeof env.port).toBe('number');
  });

  it('accepts and exports a valid MongoDB SRV URI', async () => {
    const { env } = await importEnvironment();

    expect(env.mongoUri).toBe(safeMongoUri);
  });

  it.each(['production', 'test'])('accepts the %s environment', async (nodeEnv) => {
    process.env.NODE_ENV = nodeEnv;

    const { env } = await importEnvironment();

    expect(env.nodeEnv).toBe(nodeEnv);
  });

  it('throws for an invalid NODE_ENV', async () => {
    process.env.NODE_ENV = 'staging';

    await expect(importEnvironment()).rejects.toThrow(
      'Invalid environment configuration: invalid value for NODE_ENV.',
    );
  });

  it('throws when MONGO_URI is missing', async () => {
    delete process.env.MONGO_URI;

    await expect(importEnvironment()).rejects.toThrow(
      'Invalid environment configuration: invalid value for MONGO_URI.',
    );
  });

  it('throws when MONGO_URI is empty', async () => {
    process.env.MONGO_URI = '';

    await expect(importEnvironment()).rejects.toThrow(
      'Invalid environment configuration: invalid value for MONGO_URI.',
    );
  });

  it('rejects a non-SRV MongoDB URI', async () => {
    process.env.MONGO_URI =
      'mongodb://placeholder-user:placeholder-password@cluster.example.mongodb.net/database';

    await expect(importEnvironment()).rejects.toThrow(
      'Invalid environment configuration: invalid value for MONGO_URI.',
    );
  });

  it('rejects an invalid MongoDB URI', async () => {
    process.env.MONGO_URI =
      'mongodb+srv://placeholder-user:placeholder-password@invalid hostname/database';

    await expect(importEnvironment()).rejects.toThrow(
      'Invalid environment configuration: invalid value for MONGO_URI.',
    );
  });

  it('does not include MongoDB credentials in configuration errors', async () => {
    process.env.MONGO_URI =
      'mongodb://sensitive-username:sensitive-password@cluster.example.mongodb.net/database';

    let thrownError;

    try {
      await importEnvironment();
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toBe(
      'Invalid environment configuration: invalid value for MONGO_URI.',
    );
    expect(thrownError.message).not.toContain('sensitive-username');
    expect(thrownError.message).not.toContain('sensitive-password');
    expect(thrownError.message).not.toContain(process.env.MONGO_URI);
  });

  it.each([
    ['zero', '0'],
    ['a negative value', '-1'],
    ['a non-numeric value', 'not-a-number'],
    ['a value above 65535', '65536'],
  ])('throws when PORT is %s', async (_description, port) => {
    process.env.PORT = port;

    await expect(importEnvironment()).rejects.toThrow(
      'Invalid environment configuration: invalid value for PORT.',
    );
  });

  it('exports a frozen configuration object', async () => {
    const environmentModule = await importEnvironment();

    expect(Object.keys(environmentModule)).toEqual(['env']);
    expect(Object.isFrozen(environmentModule.env)).toBe(true);
  });

  it('does not include unrelated environment values in validation errors', async () => {
    process.env.PORT = 'invalid';
    process.env.UNRELATED_SECRET = 'must-not-appear-in-an-error';

    let thrownError;

    try {
      await importEnvironment();
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toBe('Invalid environment configuration: invalid value for PORT.');
    expect(thrownError.message).not.toContain(process.env.UNRELATED_SECRET);
  });
});
