import { describe, expect, it, vi } from 'vitest';

import { asyncHandler } from '../../../src/core/errors/async-handler.js';

const createArguments = () => ({
  request: {},
  response: {
    send: vi.fn(),
    json: vi.fn(),
  },
  next: vi.fn(),
});

describe('asyncHandler', () => {
  it('runs a successful synchronous handler without forwarding an error', async () => {
    const arguments_ = createArguments();
    const handler = vi.fn();

    await asyncHandler(handler)(arguments_.request, arguments_.response, arguments_.next);

    expect(handler).toHaveBeenCalledWith(arguments_.request, arguments_.response, arguments_.next);
    expect(arguments_.next).not.toHaveBeenCalled();
  });

  it('runs a successful asynchronous handler without forwarding an error', async () => {
    const arguments_ = createArguments();
    const handler = vi.fn().mockResolvedValue('completed');

    await asyncHandler(handler)(arguments_.request, arguments_.response, arguments_.next);

    expect(handler).toHaveBeenCalledOnce();
    expect(arguments_.next).not.toHaveBeenCalled();
  });

  it('forwards a synchronously thrown error without changing its reference', () => {
    const arguments_ = createArguments();
    const originalError = new Error('Synchronous failure.');
    const handler = () => {
      throw originalError;
    };

    asyncHandler(handler)(arguments_.request, arguments_.response, arguments_.next);

    expect(arguments_.next).toHaveBeenCalledOnce();
    expect(arguments_.next).toHaveBeenCalledWith(originalError);
  });

  it('forwards a rejected promise without changing its error reference', async () => {
    const arguments_ = createArguments();
    const originalError = new Error('Asynchronous failure.');
    const handler = vi.fn().mockRejectedValue(originalError);

    await asyncHandler(handler)(arguments_.request, arguments_.response, arguments_.next);

    expect(arguments_.next).toHaveBeenCalledOnce();
    expect(arguments_.next).toHaveBeenCalledWith(originalError);
  });

  it('does not send a response or log by itself', async () => {
    const arguments_ = createArguments();
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await asyncHandler(vi.fn())(arguments_.request, arguments_.response, arguments_.next);

    expect(arguments_.response.send).not.toHaveBeenCalled();
    expect(arguments_.response.json).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });
});
