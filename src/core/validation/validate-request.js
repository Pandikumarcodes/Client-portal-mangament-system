import { z } from 'zod';

import { ApiError } from '../errors/api-error.js';
import { asyncHandler } from '../errors/async-handler.js';

const SUPPORTED_SECTIONS = Object.freeze(['body', 'params', 'query']);
const MAX_VALIDATION_DETAILS = 20;

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const normalizeIssueCode = (code) => {
  const normalizedCode = String(code)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalizedCode || 'INVALID_VALUE';
};

const createValidationDetails = (issues) =>
  issues.slice(0, MAX_VALIDATION_DETAILS).map((issue) => ({
    field: issue.path.map(String).join('.'),
    code: normalizeIssueCode(issue.code),
    message: issue.message,
  }));

const validateConfiguration = (schemas) => {
  if (!isPlainObject(schemas)) {
    throw new TypeError('Request validation schemas must be supplied as a plain object.');
  }

  const suppliedSections = Reflect.ownKeys(schemas);

  if (suppliedSections.length === 0) {
    throw new TypeError('At least one request validation schema must be supplied.');
  }

  for (const section of suppliedSections) {
    if (typeof section !== 'string' || !SUPPORTED_SECTIONS.includes(section)) {
      throw new TypeError('Unsupported request validation section.');
    }

    if (!(schemas[section] instanceof z.ZodType)) {
      throw new TypeError(`Request validation schema for ${section} must be Zod-compatible.`);
    }
  }

  return suppliedSections;
};

/**
 * On success, assigns a frozen object containing only parsed `body`, `params`,
 * and/or `query` sections supplied for validation to `request.validated`.
 */
export function validateRequest(schemas) {
  const suppliedSections = validateConfiguration(schemas);
  const composedSchema = z.object(
    Object.fromEntries(suppliedSections.map((section) => [section, schemas[section]])),
  );

  return asyncHandler(async (request, response, next) => {
    void response;

    const requestInput = Object.fromEntries(
      suppliedSections.map((section) => [section, request[section]]),
    );
    const validation = await composedSchema.safeParseAsync(requestInput);

    if (!validation.success) {
      next(
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'The request is invalid.',
          details: createValidationDetails(validation.error.issues),
          cause: validation.error,
        }),
      );
      return;
    }

    request.validated = Object.freeze(validation.data);
    next();
  });
}
