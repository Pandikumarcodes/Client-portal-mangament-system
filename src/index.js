import { env } from './config/env.js';
import { startServer, stopServer } from './server.js';

let shutdownStarted = false;

const handleSigint = () => {
  void shutdown('SIGINT');
};
const handleSigterm = () => {
  void shutdown('SIGTERM');
};

const shutdown = async (signal) => {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  process.removeListener('SIGINT', handleSigint);
  process.removeListener('SIGTERM', handleSigterm);
  console.log(`Application shutdown started (${signal}).`);

  try {
    await stopServer(signal);
    console.log('Application shutdown completed.');
    process.exitCode = 0;
  } catch {
    console.error('Application shutdown failed.');
    process.exitCode = 1;
  }
};

process.once('SIGINT', handleSigint);
process.once('SIGTERM', handleSigterm);

try {
  await startServer();

  if (!shutdownStarted) {
    console.log(`Client Management Portal API listening on port ${env.port}.`);
  }
} catch {
  console.error('Application startup failed.');
  process.exitCode = 1;

  try {
    await stopServer('startup-failure');
  } catch {
    console.error('Application shutdown failed.');
    process.exitCode = 1;
  }
}
