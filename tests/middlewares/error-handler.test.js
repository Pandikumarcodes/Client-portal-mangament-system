import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../src/core/errors/api-error.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

const createResponse = ({ headersSent = false } = {}) => {
  const response = {
    headersSent,
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);

  return response;
};

const handleError = (error, options = {}) => {
  const request = {
    cookies: {
      session: 'private-cookie',
    },
    headers: {
      authorization: 'Bearer private-token',
    },
  };
  const response = createResponse(options);
  const next = vi.fn();

  errorHandler(error, request, response, next);

  return { request, response, next };
};

describe('errorHandler', () => {
  it('returns an ApiError status, code, message, and safe details as JSON', () => {
    const details = [{ field: 'name', issue: 'Required.' }];
    const error = new ApiError({
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'The request is invalid.',
      details,
    });

    const { response } = handleError(error);

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        details,
      },
    });
  });

  it('omits details when they were not explicitly supplied', () => {
    const error = new ApiError({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'The requested resource was not found.',
    });

    const { response } = handleError(error);
    const [body] = response.json.mock.calls[0];

    expect(body.error).not.toHaveProperty('details');
  });

  it('converts unknown errors into a generic safe HTTP 500 response', () => {
    const mongoUri =
      'mongodb+srv://sensitive-user:sensitive-password@cluster.example.mongodb.net/database';
    const cause = new Error(`Filesystem and database detail: ${mongoUri}`);
    cause.stack = `Error at C:\\private\\source\\module.js using ${mongoUri}`;
    const unknownError = new Error('Internal Mongoose failure.', { cause });
    unknownError.stack = `Error at C:\\private\\source\\handler.js using ${mongoUri}`;

    const { request, response } = handleError(unknownError);
    const [body] = response.json.mock.calls[0];
    const serializedBody = JSON.stringify(body);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(serializedBody).not.toContain(unknownError.message);
    expect(serializedBody).not.toContain('stack');
    expect(serializedBody).not.toContain('cause');
    expect(serializedBody).not.toContain(mongoUri);
    expect(serializedBody).not.toContain(request.cookies.session);
    expect(serializedBody).not.toContain(request.headers.authorization);
  });

  it('normalizes malformed JSON parser errors', () => {
    const parserError = Object.assign(new SyntaxError('Unexpected token.'), {
      type: 'entity.parse.failed',
      status: 400,
    });

    const { response } = handleError(parserError);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'The request body contains invalid JSON.',
      },
    });
  });

  it('does not classify an unrelated SyntaxError as malformed JSON', () => {
    const { response } = handleError(new SyntaxError('Internal syntax detail.'));

    expect(response.status).toHaveBeenCalledWith(500);
  });

  it.each([
    Object.assign(new Error('Large body.'), { type: 'entity.too.large' }),
    Object.assign(new Error('Large body.'), { status: 413 }),
  ])('normalizes payload-too-large framework errors', (frameworkError) => {
    const { response } = handleError(frameworkError);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body exceeds the allowed size.',
      },
    });
  });

  it('delegates the original error when response headers were already sent', () => {
    const error = new Error('Late failure.');
    const { response, next } = handleError(error, { headersSent: true });

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(error);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
