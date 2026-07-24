import { ApiError } from '../core/errors/api-error.js';

const normalizeError = (error) => {
  if (error instanceof ApiError) {
    return error;
  }

  if (error?.type === 'entity.too.large' || error?.status === 413 || error?.statusCode === 413) {
    return new ApiError({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request body exceeds the allowed size.',
      cause: error,
    });
  }

  if (
    error instanceof SyntaxError &&
    error?.type === 'entity.parse.failed' &&
    (error?.status === 400 || error?.statusCode === 400)
  ) {
    return new ApiError({
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'The request body contains invalid JSON.',
      cause: error,
    });
  }

  return new ApiError({
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
    cause: error,
  });
};

export const errorHandler = (error, request, response, next) => {
  void request;

  if (response.headersSent) {
    return next(error);
  }

  const normalizedError = normalizeError(error);
  const errorResponse = {
    code: normalizedError.code,
    message: normalizedError.message,
  };

  if (normalizedError.details !== undefined) {
    errorResponse.details = normalizedError.details;
  }

  return response.status(normalizedError.statusCode).json({
    success: false,
    error: errorResponse,
  });
};
