import { setServers } from 'node:dns';

import mongoose from 'mongoose';

import { configureDnsResolvers } from './dns.js';
import { env } from './env.js';

const CONNECTION_STATE = Object.freeze({
  disconnected: 0,
  connected: 1,
  connecting: 2,
  disconnecting: 3,
});
const SERVER_SELECTION_TIMEOUT_MS = 10_000;
const CONNECTION_ERROR_MESSAGE = 'Unable to connect to MongoDB.';
const DISCONNECTION_ERROR_MESSAGE = 'Unable to disconnect from MongoDB.';

let connectionAttempt = null;

const createConnectionError = (cause) => new Error(CONNECTION_ERROR_MESSAGE, { cause });

const startConnection = async () => {
  try {
    configureDnsResolvers({
      dnsServers: env.dnsServers,
      setServers,
    });

    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });

    if (!isDatabaseReady()) {
      throw new Error('MongoDB did not reach the connected state.');
    }
  } catch (error) {
    throw createConnectionError(error);
  } finally {
    connectionAttempt = null;
  }
};

const awaitExistingConnection = async () => {
  try {
    await mongoose.connection.asPromise();

    if (!isDatabaseReady()) {
      throw new Error('MongoDB did not reach the connected state.');
    }
  } catch (error) {
    throw createConnectionError(error);
  } finally {
    connectionAttempt = null;
  }
};

export function connectDatabase() {
  if (isDatabaseReady()) {
    return Promise.resolve();
  }

  if (connectionAttempt) {
    return connectionAttempt;
  }

  if (mongoose.connection.readyState === CONNECTION_STATE.disconnecting) {
    return Promise.reject(
      createConnectionError(new Error('MongoDB disconnection is currently in progress.')),
    );
  }

  connectionAttempt =
    mongoose.connection.readyState === CONNECTION_STATE.connecting
      ? awaitExistingConnection()
      : startConnection();

  return connectionAttempt;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === CONNECTION_STATE.disconnecting) {
    return;
  }

  if (connectionAttempt) {
    try {
      await connectionAttempt;
    } catch {
      // Connection failure is already represented by the attempt's rejected promise.
    }
  }

  if (mongoose.connection.readyState === CONNECTION_STATE.disconnected) {
    connectionAttempt = null;
    return;
  }

  if (
    mongoose.connection.readyState !== CONNECTION_STATE.connected &&
    mongoose.connection.readyState !== CONNECTION_STATE.connecting
  ) {
    connectionAttempt = null;
    return;
  }

  try {
    await mongoose.disconnect();
    connectionAttempt = null;
  } catch (error) {
    throw new Error(DISCONNECTION_ERROR_MESSAGE, { cause: error });
  }
}

export function isDatabaseReady() {
  return mongoose.connection.readyState === CONNECTION_STATE.connected;
}
