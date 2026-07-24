const ERROR_CODE_PATTERN = /^[A-Z0-9_]+$/;

export class ApiError extends Error {
  constructor({ statusCode, code, message, details, cause }) {
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
      throw new TypeError('ApiError statusCode must be an integer from 400 through 599.');
    }

    if (typeof code !== 'string' || !ERROR_CODE_PATTERN.test(code)) {
      throw new TypeError('ApiError code must be a non-empty uppercase application error code.');
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new TypeError('ApiError message must be a non-empty public message.');
    }

    super(message, cause === undefined ? undefined : { cause });

    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}
