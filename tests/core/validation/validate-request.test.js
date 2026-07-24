import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError } from '../../../src/core/errors/api-error.js';
import { validateRequest } from '../../../src/core/validation/validate-request.js';

const createRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  ...overrides,
});

const runMiddleware = async (middleware, request = createRequest()) => {
  const response = {
    json: vi.fn(),
    send: vi.fn(),
  };
  const next = vi.fn();

  await middleware(request, response, next);

  return { request, response, next };
};

describe('validateRequest configuration', () => {
  it('returns an Express middleware function', () => {
    expect(validateRequest({ body: z.object({}) })).toBeTypeOf('function');
  });

  it.each([
    ['missing schemas', undefined],
    ['null schemas', null],
    ['array schemas', []],
    ['empty schemas', {}],
  ])('rejects %s during middleware creation', (_description, schemas) => {
    expect(() => validateRequest(schemas)).toThrow(TypeError);
  });

  it.each([
    { headers: z.object({}) },
    { cookies: z.object({}) },
    { files: z.object({}) },
    { response: z.object({}) },
  ])('rejects unsupported schema keys in %j', (schemas) => {
    expect(() => validateRequest(schemas)).toThrow(TypeError);
  });

  it.each(['body', 'params', 'query'])('rejects a non-Zod %s schema', (section) => {
    expect(() => validateRequest({ [section]: {} })).toThrow(TypeError);
  });
});

describe('validateRequest success behavior', () => {
  it('validates a body and exposes its parsed output', async () => {
    const request = createRequest({ body: { name: 'Client' } });

    const result = await runMiddleware(
      validateRequest({ body: z.object({ name: z.string() }) }),
      request,
    );

    expect(result.request.validated).toEqual({ body: { name: 'Client' } });
  });

  it('validates route parameters', async () => {
    const request = createRequest({ params: { projectId: 'project-123' } });

    const result = await runMiddleware(
      validateRequest({ params: z.object({ projectId: z.string() }) }),
      request,
    );

    expect(result.request.validated).toEqual({
      params: { projectId: 'project-123' },
    });
  });

  it('validates query parameters', async () => {
    const request = createRequest({ query: { search: 'client' } });

    const result = await runMiddleware(
      validateRequest({ query: z.object({ search: z.string() }) }),
      request,
    );

    expect(result.request.validated).toEqual({ query: { search: 'client' } });
  });

  it('validates body, params, and query through one middleware', async () => {
    const request = createRequest({
      body: { name: 'Client' },
      params: { clientId: 'client-123' },
      query: { page: '2' },
    });

    const result = await runMiddleware(
      validateRequest({
        body: z.object({ name: z.string() }),
        params: z.object({ clientId: z.string() }),
        query: z.object({ page: z.coerce.number().int() }),
      }),
      request,
    );

    expect(result.request.validated).toEqual({
      body: { name: 'Client' },
      params: { clientId: 'client-123' },
      query: { page: 2 },
    });
  });

  it('includes only sections supplied for validation and freezes the top level', async () => {
    const result = await runMiddleware(
      validateRequest({ params: z.object({ id: z.string() }) }),
      createRequest({
        body: { unvalidated: true },
        params: { id: '123' },
        query: { unvalidated: true },
      }),
    );

    expect(result.request.validated).toEqual({ params: { id: '123' } });
    expect(Object.isFrozen(result.request.validated)).toBe(true);
    expect(result.request.validated).not.toHaveProperty('body');
    expect(result.request.validated).not.toHaveProperty('query');
  });

  it('does not mutate raw body, params, or getter-backed query values', async () => {
    const body = { name: '  Client  ', extra: 'preserved' };
    const params = { id: '007' };
    const query = { page: '3' };
    const request = {
      body,
      params,
    };
    Object.defineProperty(request, 'query', {
      configurable: false,
      enumerable: true,
      get: () => query,
    });

    const result = await runMiddleware(
      validateRequest({
        body: z.object({ name: z.string().trim() }),
        params: z.object({ id: z.coerce.number() }),
        query: z.object({ page: z.coerce.number() }),
      }),
      request,
    );

    expect(request.body).toBe(body);
    expect(request.params).toBe(params);
    expect(request.query).toBe(query);
    expect(request.body).toEqual({ name: '  Client  ', extra: 'preserved' });
    expect(request.params).toEqual({ id: '007' });
    expect(request.query).toEqual({ page: '3' });
    expect(result.request.validated).toEqual({
      body: { name: 'Client' },
      params: { id: 7 },
      query: { page: 3 },
    });
  });

  it('preserves transformations in request.validated', async () => {
    const result = await runMiddleware(
      validateRequest({
        body: z.object({
          label: z.string().transform((value) => value.toUpperCase()),
        }),
      }),
      createRequest({ body: { label: 'priority' } }),
    );

    expect(result.request.validated.body.label).toBe('PRIORITY');
  });

  it('leaves unknown-property behavior to the supplied Zod schema', async () => {
    const stripped = await runMiddleware(
      validateRequest({ body: z.object({ name: z.string() }) }),
      createRequest({ body: { name: 'Client', extra: 'removed' } }),
    );
    const passedThrough = await runMiddleware(
      validateRequest({ body: z.object({ name: z.string() }).passthrough() }),
      createRequest({ body: { name: 'Client', extra: 'retained' } }),
    );

    expect(stripped.request.validated.body).toEqual({ name: 'Client' });
    expect(passedThrough.request.validated.body).toEqual({
      name: 'Client',
      extra: 'retained',
    });
  });

  it('calls next exactly once without an error after successful validation', async () => {
    const { next } = await runMiddleware(
      validateRequest({ body: z.object({ name: z.string() }) }),
      createRequest({ body: { name: 'Client' } }),
    );

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });
});

describe('validateRequest failure behavior', () => {
  it.each([
    [
      'body',
      { body: z.object({ email: z.email('Invalid email address.') }) },
      createRequest({ body: { email: 'invalid' } }),
      'body.email',
    ],
    [
      'params',
      { params: z.object({ projectId: z.uuid('Invalid project identifier.') }) },
      createRequest({ params: { projectId: 'invalid' } }),
      'params.projectId',
    ],
    [
      'query',
      { query: z.object({ page: z.coerce.number().int().positive() }) },
      createRequest({ query: { page: '0' } }),
      'query.page',
    ],
  ])('forwards a safe ApiError for invalid %s', async (_section, schemas, request, field) => {
    const { next } = await runMiddleware(validateRequest(schemas), request);

    expect(next).toHaveBeenCalledOnce();
    const [error] = next.mock.calls[0];
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'The request is invalid.',
    });
    expect(error.details[0]).toEqual({
      field,
      code: expect.stringMatching(/^[A-Z0-9_]+$/),
      message: expect.any(String),
    });
    expect(Object.keys(error.details[0]).sort()).toEqual(['code', 'field', 'message']);
    expect(error.cause).toBeInstanceOf(z.ZodError);
  });

  it('reports issues from all supplied request sections in deterministic order', async () => {
    const { next } = await runMiddleware(
      validateRequest({
        body: z.object({ name: z.string().min(1, 'Name is required.') }),
        params: z.object({ id: z.uuid('Invalid identifier.') }),
        query: z.object({ page: z.coerce.number().positive('Page must be positive.') }),
      }),
      createRequest({
        body: { name: '' },
        params: { id: 'invalid' },
        query: { page: '0' },
      }),
    );

    const [error] = next.mock.calls[0];
    expect(error.details.map((detail) => detail.field)).toEqual([
      'body.name',
      'params.id',
      'query.page',
    ]);
  });

  it('uses the request section when an issue has no schema-relative path', async () => {
    const { next } = await runMiddleware(
      validateRequest({
        body: z.object({}).refine(() => false, 'The body is invalid.'),
      }),
      createRequest({ body: {} }),
    );

    expect(next.mock.calls[0][0].details[0].field).toBe('body');
  });

  it('does not expose raw values, secrets, request bodies, or Zod issue input', async () => {
    const password = 'private-password-value';
    const token = 'private-token-value';
    const body = {
      password,
      token,
      email: 'invalid-email',
    };
    const { next } = await runMiddleware(
      validateRequest({
        body: z.object({
          password: z.string().min(100, 'Password does not meet requirements.'),
          token: z.string().min(100, 'Token does not meet requirements.'),
          email: z.email('Invalid email address.'),
        }),
      }),
      createRequest({ body }),
    );

    const [error] = next.mock.calls[0];
    const serializedDetails = JSON.stringify(error.details);

    expect(serializedDetails).not.toContain(password);
    expect(serializedDetails).not.toContain(token);
    expect(serializedDetails).not.toContain(JSON.stringify(body));
    expect(serializedDetails).not.toContain('"input"');
    expect(serializedDetails).not.toContain('authorization');
    expect(serializedDetails).not.toContain('cookies');
  });

  it('limits safe details to the first 20 issues without count metadata', async () => {
    const schemaShape = Object.fromEntries(
      Array.from({ length: 25 }, (_value, index) => [`field${index}`, z.string()]),
    );
    const { next } = await runMiddleware(
      validateRequest({ body: z.object(schemaShape) }),
      createRequest({ body: {} }),
    );

    const [error] = next.mock.calls[0];
    expect(error.details).toHaveLength(20);
    expect(error.details[0].field).toBe('body.field0');
    expect(error.details[19].field).toBe('body.field19');
    expect(error).not.toHaveProperty('issueCount');
  });

  it('supports a successful asynchronous refinement', async () => {
    const schema = z.string().refine(async (value) => value === 'allowed');
    const { request, next } = await runMiddleware(
      validateRequest({ body: z.object({ value: schema }) }),
      createRequest({ body: { value: 'allowed' } }),
    );

    expect(request.validated.body.value).toBe('allowed');
    expect(next).toHaveBeenCalledWith();
  });

  it('converts a failed asynchronous refinement into VALIDATION_ERROR', async () => {
    const schema = z.string().refine(async () => false, 'The supplied value is not allowed.');
    const { next } = await runMiddleware(
      validateRequest({ body: z.object({ value: schema }) }),
      createRequest({ body: { value: 'rejected' } }),
    );

    expect(next.mock.calls[0][0]).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        {
          field: 'body.value',
          code: 'CUSTOM',
          message: 'The supplied value is not allowed.',
        },
      ],
    });
  });

  it('forwards unexpected schema execution errors unchanged', async () => {
    const unexpectedError = new Error('Unexpected internal schema failure.');
    const schema = z.string().transform(() => {
      throw unexpectedError;
    });
    const { next } = await runMiddleware(
      validateRequest({ body: z.object({ value: schema }) }),
      createRequest({ body: { value: 'input' } }),
    );

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(unexpectedError);
  });

  it('does not send responses, log, or terminate the process', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    const { response } = await runMiddleware(
      validateRequest({ body: z.object({ value: z.string() }) }),
      createRequest({ body: { value: 42 } }),
    );

    expect(response.json).not.toHaveBeenCalled();
    expect(response.send).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(processExit).not.toHaveBeenCalled();

    consoleLog.mockRestore();
    consoleError.mockRestore();
    processExit.mockRestore();
  });
});
