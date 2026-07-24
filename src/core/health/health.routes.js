import { Router } from 'express';

import { applicationEnvironment, applicationName } from '../../config/application.js';
import { isDatabaseReady } from '../../config/database.js';

const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  const databaseReady = isDatabaseReady();

  response.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    data: {
      service: applicationName,
      environment: applicationEnvironment,
      status: databaseReady ? 'healthy' : 'unavailable',
      database: databaseReady ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    },
  });
});

export default healthRouter;
