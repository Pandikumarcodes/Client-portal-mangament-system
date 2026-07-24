import { createServer } from 'node:http';

import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
// const dns = require('dns');
// Fixes Windows Node.js SRV DNS resolution failure with MongoDB Atlas — do not remove
// dns.setServers(['8.8.8.8', '1.1.1.1']);
const START_ERROR_MESSAGE = 'Unable to start HTTP server.';
const STOP_ERROR_MESSAGE = 'Unable to stop application infrastructure.';

let activeServer = null;
let startupPromise = null;
let shutdownPromise = null;

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const listen = (server) =>
  new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);

    try {
      server.listen(env.port);
    } catch (error) {
      server.off('error', handleError);
      server.off('listening', handleListening);
      reject(error);
    }
  });

const startInfrastructure = async () => {
  await connectDatabase();

  let server;

  try {
    server = createServer(createApp());
    await listen(server);
    activeServer = server;

    return server;
  } catch (error) {
    if (server?.listening) {
      try {
        await closeServer(server);
      } catch {
        // The fixed startup error below remains the public failure.
      }
    }

    try {
      await disconnectDatabase();
    } catch {
      // The original HTTP startup failure remains the preserved cause.
    }

    activeServer = null;
    throw new Error(START_ERROR_MESSAGE, { cause: error });
  }
};

export function startServer() {
  if (activeServer) {
    return Promise.resolve(activeServer);
  }

  if (startupPromise) {
    return startupPromise;
  }

  if (shutdownPromise) {
    return shutdownPromise.then(() => startServer());
  }

  const attempt = startInfrastructure();
  startupPromise = attempt;

  void attempt.then(
    () => {
      if (startupPromise === attempt) {
        startupPromise = null;
      }
    },
    () => {
      if (startupPromise === attempt) {
        startupPromise = null;
      }
    },
  );

  return attempt;
}

const stopInfrastructure = async () => {
  const pendingStartup = startupPromise;

  if (pendingStartup) {
    try {
      await pendingStartup;
    } catch {
      // Startup performs its own cleanup and exposes its failure to its caller.
    }
  }

  let shutdownCause;
  const server = activeServer;

  if (server) {
    try {
      await closeServer(server);
    } catch (error) {
      shutdownCause = error;
    } finally {
      activeServer = null;
    }
  }

  try {
    await disconnectDatabase();
  } catch (error) {
    shutdownCause ??= error;
  }

  if (shutdownCause) {
    throw new Error(STOP_ERROR_MESSAGE, { cause: shutdownCause });
  }
};

export function stopServer(reason) {
  void reason;

  if (shutdownPromise) {
    return shutdownPromise;
  }

  const attempt = stopInfrastructure();
  shutdownPromise = attempt;

  void attempt.then(
    () => {
      if (shutdownPromise === attempt) {
        shutdownPromise = null;
      }
    },
    () => {
      if (shutdownPromise === attempt) {
        shutdownPromise = null;
      }
    },
  );

  return attempt;
}
