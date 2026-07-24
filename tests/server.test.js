import { EventEmitter } from 'node:events';
import { Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
  createApp: vi.fn(),
  createServer: vi.fn(),
  realCreateServer: null,
  env: Object.freeze({
    port: 0,
    mongoUri:
      'mongodb+srv://placeholder-user:placeholder-password@cluster.example.mongodb.net/database',
  }),
}));

vi.mock('node:http', async () => {
  const actual = await vi.importActual('node:http');
  mocks.realCreateServer = actual.createServer;

  return {
    ...actual,
    createServer: mocks.createServer,
  };
});

vi.mock('../src/config/database.js', () => ({
  connectDatabase: mocks.connectDatabase,
  disconnectDatabase: mocks.disconnectDatabase,
}));

vi.mock('../src/config/env.js', () => ({
  env: mocks.env,
}));

vi.mock('../src/app.js', () => ({
  createApp: mocks.createApp,
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const createControlledServer = ({ listenError, closeError } = {}) => {
  const server = new EventEmitter();
  server.listening = false;
  server.listen = vi.fn(() => {
    if (listenError) {
      queueMicrotask(() => server.emit('error', listenError));
      return server;
    }

    server.listening = true;
    queueMicrotask(() => server.emit('listening'));
    return server;
  });
  server.close = vi.fn((callback) => {
    server.listening = false;
    queueMicrotask(() => callback(closeError));
    return server;
  });

  return server;
};

let serverModule;

beforeEach(() => {
  vi.resetModules();
  mocks.connectDatabase.mockReset().mockResolvedValue();
  mocks.disconnectDatabase.mockReset().mockResolvedValue();
  mocks.createApp.mockReset().mockReturnValue((_request, response) => response.end());
  mocks.createServer.mockReset().mockImplementation((handler) => mocks.realCreateServer(handler));
  serverModule = null;
});

afterEach(async () => {
  if (serverModule) {
    mocks.disconnectDatabase.mockResolvedValue();
    await serverModule.stopServer('test-cleanup');
  }
});

const importServer = async () => {
  serverModule = await import('../src/server.js');
  return serverModule;
};

describe('server lifecycle', () => {
  it('has exactly the public startup and shutdown operations', async () => {
    const lifecycle = await importServer();

    expect(Object.keys(lifecycle).sort()).toEqual(['startServer', 'stopServer']);
  });

  it('does not connect, create an application, or create a listener when imported', async () => {
    await importServer();

    expect(mocks.connectDatabase).not.toHaveBeenCalled();
    expect(mocks.createApp).not.toHaveBeenCalled();
    expect(mocks.createServer).not.toHaveBeenCalled();
  });

  it('connects the database before creating the application', async () => {
    const callOrder = [];
    mocks.connectDatabase.mockImplementation(async () => {
      callOrder.push('database');
    });
    mocks.createApp.mockImplementation(() => {
      callOrder.push('application');
      return (_request, response) => response.end();
    });
    const { startServer } = await importServer();

    await startServer();

    expect(callOrder).toEqual(['database', 'application']);
  });

  it('does not create the application or listener when database connection fails', async () => {
    const databaseError = new Error('Unable to connect to MongoDB.');
    mocks.connectDatabase.mockRejectedValue(databaseError);
    const { startServer } = await importServer();

    await expect(startServer()).rejects.toBe(databaseError);
    expect(mocks.createApp).not.toHaveBeenCalled();
    expect(mocks.createServer).not.toHaveBeenCalled();
  });

  it('returns an HTTP Server only after it is listening on an ephemeral port', async () => {
    const { startServer } = await importServer();

    const server = await startServer();

    expect(server).toBeInstanceOf(Server);
    expect(server.listening).toBe(true);
    expect(server.address()).toMatchObject({ port: expect.any(Number) });
    expect(server.address().port).toBeGreaterThan(0);
  });

  it('shares one concurrent startup attempt and one active HTTP server', async () => {
    const connection = deferred();
    mocks.connectDatabase.mockReturnValue(connection.promise);
    const { startServer } = await importServer();

    const firstStart = startServer();
    const secondStart = startServer();

    expect(secondStart).toBe(firstStart);
    expect(mocks.connectDatabase).toHaveBeenCalledOnce();

    connection.resolve();
    const [firstServer, secondServer] = await Promise.all([firstStart, secondStart]);

    expect(firstServer).toBe(secondServer);
    expect(mocks.createServer).toHaveBeenCalledOnce();
  });

  it('returns the active server without starting again', async () => {
    const { startServer } = await importServer();
    const server = await startServer();

    await expect(startServer()).resolves.toBe(server);
    expect(mocks.connectDatabase).toHaveBeenCalledOnce();
    expect(mocks.createServer).toHaveBeenCalledOnce();
  });

  it('disconnects after an HTTP startup failure and preserves its cause safely', async () => {
    const listenerError = new Error('Port is unavailable.');
    mocks.createServer.mockReturnValue(createControlledServer({ listenError: listenerError }));
    const { startServer } = await importServer();

    let startupError;
    try {
      await startServer();
    } catch (error) {
      startupError = error;
    }

    expect(startupError).toMatchObject({
      message: 'Unable to start HTTP server.',
      cause: listenerError,
    });
    expect(mocks.disconnectDatabase).toHaveBeenCalledOnce();
  });

  it('closes HTTP before disconnecting MongoDB', async () => {
    const events = [];
    mocks.disconnectDatabase.mockImplementation(async () => {
      events.push('database-disconnected');
    });
    const { startServer, stopServer } = await importServer();
    const server = await startServer();
    server.once('close', () => {
      events.push('http-closed');
    });

    await stopServer('test');

    expect(server.listening).toBe(false);
    expect(events).toEqual(['http-closed', 'database-disconnected']);
  });

  it('is safe before startup and after shutdown', async () => {
    const { stopServer } = await importServer();

    await expect(stopServer('before-start')).resolves.toBeUndefined();
    await expect(stopServer('after-stop')).resolves.toBeUndefined();
    expect(mocks.disconnectDatabase).toHaveBeenCalledTimes(2);
  });

  it('shares a concurrent shutdown attempt', async () => {
    const disconnection = deferred();
    mocks.disconnectDatabase.mockReturnValue(disconnection.promise);
    const { startServer, stopServer } = await importServer();
    await startServer();

    const firstStop = stopServer('first');
    const secondStop = stopServer('second');

    expect(secondStop).toBe(firstStop);
    disconnection.resolve();
    await Promise.all([firstStop, secondStop]);
    expect(mocks.disconnectDatabase).toHaveBeenCalledOnce();
  });

  it('waits for an active startup attempt before shutting down', async () => {
    const connection = deferred();
    mocks.connectDatabase.mockReturnValue(connection.promise);
    const { startServer, stopServer } = await importServer();

    const start = startServer();
    const stop = stopServer('during-startup');
    connection.resolve();
    const server = await start;
    await stop;

    expect(server.listening).toBe(false);
    expect(mocks.disconnectDatabase).toHaveBeenCalledOnce();
  });

  it('returns a safe error when database disconnection fails', async () => {
    const sensitiveUri =
      'mongodb+srv://sensitive-user:sensitive-password@cluster.example.mongodb.net/database';
    mocks.disconnectDatabase.mockRejectedValue(new Error(`Driver failure for ${sensitiveUri}`));
    const { stopServer } = await importServer();

    let shutdownError;
    try {
      await stopServer('test');
    } catch (error) {
      shutdownError = error;
    }

    expect(shutdownError.message).toBe('Unable to stop application infrastructure.');
    expect(
      [shutdownError.message, shutdownError.stack, JSON.stringify(shutdownError)].join(' '),
    ).not.toContain(sensitiveUri);
  });

  it('disconnects even if HTTP close fails and reports a safe shutdown error', async () => {
    const closeError = new Error('Unsafe close detail.');
    mocks.createServer.mockReturnValue(createControlledServer({ closeError }));
    const { startServer, stopServer } = await importServer();
    await startServer();

    await expect(stopServer('test')).rejects.toMatchObject({
      message: 'Unable to stop application infrastructure.',
      cause: closeError,
    });
    expect(mocks.disconnectDatabase).toHaveBeenCalledOnce();
  });

  it('can start a new HTTP server after successful shutdown', async () => {
    const { startServer, stopServer } = await importServer();
    const firstServer = await startServer();
    await stopServer('restart');

    const secondServer = await startServer();

    expect(secondServer).not.toBe(firstServer);
    expect(secondServer.listening).toBe(true);
    expect(mocks.connectDatabase).toHaveBeenCalledTimes(2);
  });
});
