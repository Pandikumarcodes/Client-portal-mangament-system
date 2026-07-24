import { classifyDatabaseError } from '../core/diagnostics/database-error-diagnostic.js';

const run = async () => {
  let disconnectDatabase;

  try {
    // Dynamic import keeps environment-validation failures inside this script's safe error path.
    const database = await import('../config/database.js');
    const { connectDatabase, isDatabaseReady } = database;
    disconnectDatabase = database.disconnectDatabase;

    await connectDatabase();

    if (!isDatabaseReady()) {
      throw new Error('MongoDB connection is not ready.');
    }

    console.log('MongoDB connection verified successfully.');
  } catch (error) {
    const diagnostic = classifyDatabaseError(error);

    console.error('MongoDB connection verification failed.');
    console.error(`Cause type: ${diagnostic.causeType}`);

    if (diagnostic.causeCode) {
      console.error(`Cause code: ${diagnostic.causeCode}`);
    }

    console.error(`Diagnostic category: ${diagnostic.category}`);
    process.exitCode = 1;
  } finally {
    if (disconnectDatabase) {
      try {
        await disconnectDatabase();
      } catch {
        console.error('MongoDB disconnection failed after verification.');
        process.exitCode = 1;
      }
    }
  }
};

await run();
