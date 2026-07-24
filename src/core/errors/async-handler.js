export const asyncHandler = (handler) => (request, response, next) => {
  try {
    return Promise.resolve(handler(request, response, next)).catch(next);
  } catch (error) {
    return next(error);
  }
};
