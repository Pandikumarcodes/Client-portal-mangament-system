import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { asyncHandler } from '../../../src/core/errors/async-handler.js';
import { validateRequest } from '../../../src/core/validation/validate-request.js';
import { errorHandler } from '../../../src/middlewares/error-handler.js';
import { notFoundHandler } from '../../../src/middlewares/not-found.js';

const createTestApp = ({ bodySchema } = {}) => {
  const app = express();
  const effectiveBodySchema =
    bodySchema ??
    z.object({
      email: z.email('Invalid email address.'),
      password: z.string().min(8, 'Password must contain at least 8 characters.'),
      accessCode: z.string().refine(async (value) => value === 'allowed-code', {
        message: 'Access code is invalid.',
      }),
    });

  app.use(express.json());
  app.post(
    '/resources/:resourceId',
    validateRequest({
      body: effectiveBodySchema,
      params: z.object({
        resourceId: z.uuid('Invalid resource identifier.'),
      }),
      query: z.object({
        page: z.coerce.number().int().positive('Page must be positive.'),
      }),
    }),
    asyncHandler(async (request_, response) => {
      response.status(201).json({
        success: true,
        data: request_.validated,
      });
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

const validResourceId = '123e4567-e89b-42d3-a456-426614174000';

describe('validateRequest HTTP integration', () => {
  it('provides parsed body, params, and query values to the route handler', async () => {
    const response = await request(createTestApp())
      .post(`/resources/${validResourceId}?page=3`)
      .send({
        email: 'client@example.com',
        password: 'safe-test-password',
        accessCode: 'allowed-code',
      })
      .expect('Content-Type', /application\/json/)
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      data: {
        body: {
          email: 'client@example.com',
          password: 'safe-test-password',
          accessCode: 'allowed-code',
        },
        params: {
          resourceId: validResourceId,
        },
        query: {
          page: 3,
        },
      },
    });
    expect(typeof response.body.data.query.page).toBe('number');
  });

  it('returns safe centralized validation details for invalid input', async () => {
    const password = 'secret-value';
    const response = await request(createTestApp())
      .post('/resources/not-a-uuid?page=0')
      .send({
        email: 'invalid-email',
        password,
        accessCode: 'allowed-code',
      })
      .expect('Content-Type', /application\/json/)
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        details: expect.arrayContaining([
          {
            field: 'body.email',
            code: 'INVALID_FORMAT',
            message: 'Invalid email address.',
          },
          {
            field: 'params.resourceId',
            code: 'INVALID_FORMAT',
            message: 'Invalid resource identifier.',
          },
          {
            field: 'query.page',
            code: 'TOO_SMALL',
            message: 'Page must be positive.',
          },
        ]),
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(password);
  });

  it('handles asynchronous refinement failures through centralized middleware', async () => {
    const rejectedCode = 'private-rejected-code';
    const response = await request(createTestApp())
      .post(`/resources/${validResourceId}?page=1`)
      .send({
        email: 'client@example.com',
        password: 'safe-test-password',
        accessCode: rejectedCode,
      })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'The request is invalid.',
      details: [
        {
          field: 'body.accessCode',
          code: 'CUSTOM',
          message: 'Access code is invalid.',
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain(rejectedCode);
  });

  it('keeps unexpected schema execution failures behind the generic 500 response', async () => {
    const internalMessage = 'Private schema implementation failed.';
    const app = createTestApp({
      bodySchema: z.object({
        value: z.string().transform(() => {
          throw new Error(internalMessage);
        }),
      }),
    });

    const response = await request(app)
      .post(`/resources/${validResourceId}?page=1`)
      .send({ value: 'input' })
      .expect('Content-Type', /application\/json/)
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(internalMessage);
  });
});
