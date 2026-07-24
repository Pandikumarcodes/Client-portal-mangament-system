import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../src/core/errors/api-error.js';

const createError = (overrides = {}) =>
  new ApiError({
    statusCode: 400,
    code: 'SAFE_ERROR',
    message: 'A safe public message.',
    ...overrides,
  });

describe('ApiError', () => {
  it('extends Error with the expected name and public properties', () => {
    const error = createError({
      statusCode: 409,
      code: 'RESOURCE_CONFLICT',
      message: 'The resource conflicts with existing state.',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe('ApiError');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('RESOURCE_CONFLICT');
    expect(error.message).toBe('The resource conflicts with existing state.');
  });

  it('stores explicitly supplied safe details', () => {
    const details = [{ field: 'name', issue: 'Required.' }];

    expect(createError({ details }).details).toBe(details);
  });

  it('defaults details to undefined', () => {
    expect(createError().details).toBeUndefined();
  });

  it('preserves the original cause with the standard Error mechanism', () => {
    const cause = new Error('Internal dependency failure.');

    expect(createError({ cause }).cause).toBe(cause);
  });

  it('has a stack trace when the runtime supports it', () => {
    expect(createError().stack).toEqual(expect.any(String));
  });

  it.each([399, 600, 400.5])('rejects invalid status code %s', (statusCode) => {
    expect(() => createError({ statusCode })).toThrow(TypeError);
  });

  it.each(['', 'lowercase', 'HAS SPACE', 'INVALID-HYPHEN'])(
    'rejects invalid application error code %j',
    (code) => {
      expect(() => createError({ code })).toThrow(TypeError);
    },
  );

  it.each(['', '   '])('rejects empty public message %j', (message) => {
    expect(() => createError({ message })).toThrow(TypeError);
  });

  it('does not log or terminate the process', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

    createError();

    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(processExit).not.toHaveBeenCalled();

    consoleLog.mockRestore();
    consoleError.mockRestore();
    processExit.mockRestore();
  });
});
