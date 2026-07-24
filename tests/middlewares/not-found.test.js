import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../src/core/errors/api-error.js';
import { notFoundHandler } from '../../src/middlewares/not-found.js';

describe('notFoundHandler', () => {
  it('forwards one safe not-found ApiError without sending a response', () => {
    const request = {
      originalUrl: '/private/path?secret=query-value',
      headers: {
        authorization: 'Bearer private-token',
      },
    };
    const response = {
      send: vi.fn(),
      json: vi.fn(),
    };
    const next = vi.fn();

    notFoundHandler(request, response, next);

    expect(next).toHaveBeenCalledOnce();
    const [error] = next.mock.calls[0];
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'The requested resource was not found.',
    });
    expect(error.message).not.toContain(request.originalUrl);
    expect(error.message).not.toContain('query-value');
    expect(response.send).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
