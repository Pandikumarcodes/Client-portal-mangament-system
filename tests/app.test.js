import { describe, expect, it, vi } from 'vitest';

import request from 'supertest';

const mocks = vi.hoisted(() => ({
  isDatabaseReady: vi.fn(),
  env: Object.freeze({
    clientUrl: 'http://localhost:5173',
    nodeEnv: 'test',
  }),
}));

vi.mock('../src/config/env.js', () => ({
  env: mocks.env,
}));

vi.mock('../src/config/database.js', () => ({
  isDatabaseReady: mocks.isDatabaseReady,
}));

const { createApp } = await import('../src/app.js');

describe('createApp', () => {
  it('returns a new independent Express application without opening a listener', () => {
    const firstApp = createApp();
    const secondApp = createApp();

    expect(typeof firstApp).toBe('function');
    expect(typeof firstApp.listen).toBe('function');
    expect(firstApp).not.toBe(secondApp);
    expect(firstApp.listening).toBeUndefined();
    expect(secondApp.listening).toBeUndefined();
  });

  it('returns a healthy response when the database is ready', async () => {
    mocks.isDatabaseReady.mockReturnValue(true);

    const response = await request(createApp()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        service: 'client-management-portal-api',
        environment: 'test',
        status: 'healthy',
        database: 'connected',
      },
    });
    expect(new Date(response.body.data.timestamp).toISOString()).toBe(response.body.data.timestamp);
  });

  it('returns an unavailable response when the database is not ready', async () => {
    mocks.isDatabaseReady.mockReturnValue(false);

    const response = await request(createApp()).get('/api/v1/health').expect(503);

    expect(response.body).toMatchObject({
      success: false,
      data: {
        status: 'unavailable',
        database: 'disconnected',
      },
    });
    expect(new Date(response.body.data.timestamp).toISOString()).toBe(response.body.data.timestamp);
  });

  it('does not expose infrastructure secrets in health responses', async () => {
    mocks.isDatabaseReady.mockReturnValue(true);

    const response = await request(createApp()).get('/api/v1/health');
    const serializedResponse = JSON.stringify(response.body);

    expect(serializedResponse).not.toContain('MONGO_URI');
    expect(serializedResponse).not.toContain('username');
    expect(serializedResponse).not.toContain('password');
    expect(serializedResponse).not.toContain('DNS_SERVERS');
  });

  it('removes X-Powered-By and applies Helmet security headers', async () => {
    mocks.isDatabaseReady.mockReturnValue(true);

    const response = await request(createApp()).get('/api/v1/health');

    expect(response.headers).not.toHaveProperty('x-powered-by');
    expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(response.headers).toHaveProperty('content-security-policy');
  });

  it('allows the configured credentialed CORS origin', async () => {
    mocks.isDatabaseReady.mockReturnValue(true);

    const response = await request(createApp())
      .get('/api/v1/health')
      .set('Origin', mocks.env.clientUrl);

    expect(response.headers['access-control-allow-origin']).toBe(mocks.env.clientUrl);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not reflect an unrelated CORS origin', async () => {
    mocks.isDatabaseReady.mockReturnValue(true);

    const response = await request(createApp())
      .get('/api/v1/health')
      .set('Origin', 'https://unrelated.example');

    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('rejects JSON request bodies larger than 1mb', async () => {
    const oversizedBody = { value: 'a'.repeat(1024 * 1024) };

    const response = await request(createApp())
      .post('/api/v1/health')
      .send(oversizedBody)
      .expect('Content-Type', /application\/json/)
      .expect(413);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body exceeds the allowed size.',
      },
    });
  });

  it('returns the standardized safe JSON response for an unknown route', async () => {
    const requestedUrl = '/missing/private-resource?token=query-secret';

    const response = await request(createApp())
      .get(requestedUrl)
      .expect('Content-Type', /application\/json/)
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(requestedUrl);
    expect(JSON.stringify(response.body)).not.toContain('query-secret');
  });

  it('returns INVALID_JSON for malformed JSON without a production test route', async () => {
    const response = await request(createApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"invalidJson":')
      .expect('Content-Type', /application\/json/)
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'The request body contains invalid JSON.',
      },
    });
  });

  it.each(['/throw-error', '/test-error', '/debug', '/crash'])(
    'does not expose a production debug route at %s',
    async (path) => {
      const response = await request(createApp()).get(path).expect(404);

      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    },
  );
});
