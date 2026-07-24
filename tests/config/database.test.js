import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const connection = {
    readyState: 0,
    asPromise: vi.fn(),
  };

  return {
    connection,
    connect: vi.fn(),
    disconnect: vi.fn(),
    configureDnsResolvers: vi.fn(),
    setServers: vi.fn(),
    env: Object.freeze({
      mongoUri:
        'mongodb+srv://placeholder-user:placeholder-password@cluster.example.mongodb.net/database',
      dnsServers: Object.freeze(['192.0.2.53', '2001:db8::53']),
    }),
  };
});

vi.mock('mongoose', () => ({
  default: {
    connection: mocks.connection,
    connect: mocks.connect,
    disconnect: mocks.disconnect,
  },
}));

vi.mock('node:dns', () => ({
  setServers: mocks.setServers,
}));

vi.mock('../../src/config/env.js', () => ({
  env: mocks.env,
}));

vi.mock('../../src/config/dns.js', () => ({
  configureDnsResolvers: mocks.configureDnsResolvers,
}));

const databaseSource = readFileSync(
  new URL('../../src/config/database.js', import.meta.url),
  'utf8',
);

const importDatabase = async () => {
  vi.resetModules();
  return import('../../src/config/database.js');
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

beforeEach(() => {
  mocks.connection.readyState = 0;
  mocks.connection.asPromise.mockReset();
  mocks.connect.mockReset();
  mocks.disconnect.mockReset();
  mocks.configureDnsResolvers.mockReset();
  mocks.setServers.mockReset();
  mocks.configureDnsResolvers.mockReturnValue({ applied: false, servers: [] });
  mocks.connect.mockImplementation(async () => {
    mocks.connection.readyState = 1;
  });
  mocks.disconnect.mockImplementation(async () => {
    mocks.connection.readyState = 0;
  });
});

describe('database lifecycle public API', () => {
  it('exports exactly the three database lifecycle operations', async () => {
    const database = await importDatabase();

    expect(Object.keys(database).sort()).toEqual([
      'connectDatabase',
      'disconnectDatabase',
      'isDatabaseReady',
    ]);
  });

  it('does not connect or disconnect when imported', async () => {
    await importDatabase();

    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it('does not call process.exit', () => {
    expect(databaseSource).not.toContain('process.exit');
  });
});

describe('connectDatabase', () => {
  it('applies DNS configuration with env servers before connecting', async () => {
    const callOrder = [];
    mocks.configureDnsResolvers.mockImplementation(() => {
      callOrder.push('dns');
    });
    mocks.connect.mockImplementation(async () => {
      callOrder.push('connect');
      mocks.connection.readyState = 1;
    });
    const { connectDatabase } = await importDatabase();

    await connectDatabase();

    expect(mocks.configureDnsResolvers).toHaveBeenCalledWith({
      dnsServers: mocks.env.dnsServers,
      setServers: mocks.setServers,
    });
    expect(callOrder).toEqual(['dns', 'connect']);
  });

  it('contains no hardcoded DNS resolver values', () => {
    for (const dnsServer of mocks.env.dnsServers) {
      expect(databaseSource).not.toContain(dnsServer);
    }
  });

  it('does not connect when DNS policy configuration fails', async () => {
    mocks.configureDnsResolvers.mockImplementation(() => {
      throw new Error('DNS policy failed.');
    });
    const { connectDatabase } = await importDatabase();

    await expect(connectDatabase()).rejects.toThrow('Unable to connect to MongoDB.');
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('connects with the validated URI and development timeout when disconnected', async () => {
    const { connectDatabase } = await importDatabase();

    await connectDatabase();

    expect(mocks.connect).toHaveBeenCalledWith(mocks.env.mongoUri, {
      serverSelectionTimeoutMS: 10_000,
    });
  });

  it('returns without reconnecting when already connected', async () => {
    mocks.connection.readyState = 1;
    const { connectDatabase } = await importDatabase();

    await expect(connectDatabase()).resolves.toBeUndefined();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.configureDnsResolvers).not.toHaveBeenCalled();
  });

  it('shares one active connection attempt across concurrent calls', async () => {
    const connection = deferred();
    mocks.connect.mockImplementation(() =>
      connection.promise.then(() => {
        mocks.connection.readyState = 1;
      }),
    );
    const { connectDatabase } = await importDatabase();

    const firstAttempt = connectDatabase();
    const secondAttempt = connectDatabase();

    expect(secondAttempt).toBe(firstAttempt);
    expect(mocks.connect).toHaveBeenCalledOnce();

    connection.resolve();
    await Promise.all([firstAttempt, secondAttempt]);
  });

  it('awaits an existing Mongoose connecting state without calling connect', async () => {
    mocks.connection.readyState = 2;
    mocks.connection.asPromise.mockImplementation(async () => {
      mocks.connection.readyState = 1;
    });
    const { connectDatabase } = await importDatabase();

    await connectDatabase();

    expect(mocks.connection.asPromise).toHaveBeenCalledOnce();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.configureDnsResolvers).not.toHaveBeenCalled();
  });

  it('rejects safely while Mongoose is disconnecting', async () => {
    mocks.connection.readyState = 3;
    const { connectDatabase } = await importDatabase();

    await expect(connectDatabase()).rejects.toMatchObject({
      message: 'Unable to connect to MongoDB.',
    });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('resolves only after the connected state is reached', async () => {
    const connection = deferred();
    mocks.connect.mockImplementation(() => connection.promise);
    const { connectDatabase, isDatabaseReady } = await importDatabase();
    const attempt = connectDatabase();

    expect(isDatabaseReady()).toBe(false);

    mocks.connection.readyState = 1;
    connection.resolve();

    await expect(attempt).resolves.toBeUndefined();
    expect(isDatabaseReady()).toBe(true);
  });

  it('rejects safely if connect resolves without reaching connected state', async () => {
    mocks.connect.mockResolvedValue(undefined);
    const { connectDatabase } = await importDatabase();

    await expect(connectDatabase()).rejects.toMatchObject({
      message: 'Unable to connect to MongoDB.',
      cause: expect.any(Error),
    });
  });

  it('wraps connection failures with a safe message and original cause', async () => {
    const originalError = new Error(`Driver failure for ${mocks.env.mongoUri}`);
    mocks.connect.mockRejectedValue(originalError);
    const { connectDatabase } = await importDatabase();

    const error = await connectDatabase().catch((caughtError) => caughtError);

    expect(error).toMatchObject({
      message: 'Unable to connect to MongoDB.',
      cause: originalError,
    });
    expect(error.message).not.toContain(mocks.env.mongoUri);
    expect(error.message).not.toContain('placeholder-password');
  });

  it('clears its active attempt after success', async () => {
    const { connectDatabase } = await importDatabase();

    await connectDatabase();
    mocks.connection.readyState = 0;
    await connectDatabase();

    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it('clears its active attempt after failure', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('First failure.'));
    const { connectDatabase } = await importDatabase();

    await expect(connectDatabase()).rejects.toThrow('Unable to connect to MongoDB.');
    await connectDatabase();

    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });
});

describe('disconnectDatabase', () => {
  it('disconnects when connected', async () => {
    mocks.connection.readyState = 1;
    const { disconnectDatabase } = await importDatabase();

    await expect(disconnectDatabase()).resolves.toBeUndefined();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('returns safely when already disconnected', async () => {
    const { disconnectDatabase } = await importDatabase();

    await expect(disconnectDatabase()).resolves.toBeUndefined();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it('returns safely when already disconnecting', async () => {
    mocks.connection.readyState = 3;
    const { disconnectDatabase } = await importDatabase();

    await expect(disconnectDatabase()).resolves.toBeUndefined();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it('waits for an active successful application connection before disconnecting', async () => {
    const connection = deferred();
    mocks.connect.mockImplementation(() =>
      connection.promise.then(() => {
        mocks.connection.readyState = 1;
      }),
    );
    const { connectDatabase, disconnectDatabase } = await importDatabase();
    const connectionAttempt = connectDatabase();
    const disconnectionAttempt = disconnectDatabase();

    expect(mocks.disconnect).not.toHaveBeenCalled();

    connection.resolve();
    await Promise.all([connectionAttempt, disconnectionAttempt]);

    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('handles an active rejected connection without an unhandled rejection', async () => {
    const connection = deferred();
    mocks.connection.readyState = 2;
    mocks.connection.asPromise.mockImplementation(() =>
      connection.promise.catch((error) => {
        mocks.connection.readyState = 0;
        throw error;
      }),
    );
    const { connectDatabase, disconnectDatabase } = await importDatabase();
    const connectionAttempt = connectDatabase();
    const disconnectionAttempt = disconnectDatabase();

    connection.reject(new Error('Connection failed.'));
    const results = await Promise.allSettled([connectionAttempt, disconnectionAttempt]);

    expect(results.map(({ status }) => status)).toEqual(['rejected', 'fulfilled']);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it('wraps disconnection failures with a safe message and original cause', async () => {
    const originalError = new Error(`Driver failure for ${mocks.env.mongoUri}`);
    mocks.connection.readyState = 1;
    mocks.disconnect.mockRejectedValue(originalError);
    const { disconnectDatabase } = await importDatabase();

    const error = await disconnectDatabase().catch((caughtError) => caughtError);

    expect(error).toMatchObject({
      message: 'Unable to disconnect from MongoDB.',
      cause: originalError,
    });
    expect(error.message).not.toContain(mocks.env.mongoUri);
    expect(error.message).not.toContain('placeholder-password');
  });
});

describe('isDatabaseReady', () => {
  it.each([
    [0, false],
    [1, true],
    [2, false],
    [3, false],
  ])('returns the expected readiness for state %s', async (readyState, expected) => {
    mocks.connection.readyState = readyState;
    const { isDatabaseReady } = await importDatabase();

    expect(isDatabaseReady()).toBe(expected);
  });
});
