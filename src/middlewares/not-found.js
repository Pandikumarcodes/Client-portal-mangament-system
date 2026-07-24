import { ApiError } from '../core/errors/api-error.js';

export const notFoundHandler = (request, response, next) => {
  void request;
  void response;

  next(
    new ApiError({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'The requested resource was not found.',
    }),
  );
};
