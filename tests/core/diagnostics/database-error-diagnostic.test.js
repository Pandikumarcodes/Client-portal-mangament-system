import { describe, expect, it } from 'vitest';

import * as databaseErrorDiagnostic from '../../../src/core/diagnostics/database-error-diagnostic.js';
import { classifyDatabaseError } from '../../../src/core/diagnostics/database-error-diagnostic.js';

describe('database error diagnostic public API', () => {
  it('exports only classifyDatabaseError', () => {
    expect(Object.keys(databaseErrorDiagnostic)).toEqual(['classifyDatabaseError']);
  });
});

describe('classifyDatabaseError', () => {
  it.each([
    ['ENOTFOUND', 'dns-record-not-found'],
    ['ENODATA', 'dns-record-not-found'],
    ['ETIMEOUT', 'dns-timeout'],
    ['EAI_AGAIN', 'dns-timeout'],
  ])('classifies DNS code %s', (code, category) => {
    const error = Object.assign(new Error('Unsafe DNS detail.'), { code });

    expect(classifyDatabaseError(error)).toEqual({
      category,
      causeType: 'Error',
      causeCode: code,
    });
  });

  it('classifies a refused SRV query', () => {
    const error = Object.assign(new Error('Unsafe DNS detail.'), {
      code: 'ECONNREFUSED',
      syscall: 'querySrv',
    });

    expect(classifyDatabaseError(error)).toEqual({
      category: 'dns-resolver-refused',
      causeType: 'Error',
      causeCode: 'ECONNREFUSED',
    });
  });

  it('does not classify unrelated refused operations as DNS resolver failures', () => {
    const error = Object.assign(new Error('Unsafe connection detail.'), {
      code: 'ECONNREFUSED',
      syscall: 'connect',
    });

    expect(classifyDatabaseError(error).category).toBe('database-connection-failed');
  });

  it.each([
    [{ code: 18 }, '18'],
    [{ codeName: 'AuthenticationFailed' }, null],
    [{ name: 'MongoAuthenticationError' }, null],
  ])('classifies MongoDB authentication metadata', (metadata, causeCode) => {
    const error = Object.assign(new Error('Unsafe authentication detail.'), metadata);

    expect(classifyDatabaseError(error)).toEqual({
      category: 'authentication-failed',
      causeType: metadata.name ?? 'Error',
      causeCode,
    });
  });

  it.each(['MongooseServerSelectionError', 'MongoServerSelectionError'])(
    'classifies %s safely',
    (name) => {
      const error = Object.assign(new Error('Unsafe server detail.'), { name });

      expect(classifyDatabaseError(error)).toEqual({
        category: 'server-selection-failed',
        causeType: name,
        causeCode: null,
      });
    },
  );

  it('traverses causes and reports metadata from the classified cause', () => {
    const rootCause = Object.assign(new Error('Contains private connection details.'), {
      code: 'ETIMEOUT',
    });
    const error = new Error('Unable to connect to MongoDB.', { cause: rootCause });

    expect(classifyDatabaseError(error)).toEqual({
      category: 'dns-timeout',
      causeType: 'Error',
      causeCode: 'ETIMEOUT',
    });
  });

  it('prefers a specific nested DNS cause over an outer server-selection wrapper', () => {
    const rootCause = Object.assign(new Error('Contains private connection details.'), {
      code: 'ENOTFOUND',
    });
    const serverSelectionError = Object.assign(new Error('Server selection failed.'), {
      name: 'MongooseServerSelectionError',
      cause: rootCause,
    });

    expect(classifyDatabaseError(serverSelectionError)).toEqual({
      category: 'dns-record-not-found',
      causeType: 'Error',
      causeCode: 'ENOTFOUND',
    });
  });

  it('does not classify a generic Mongoose error as a server-selection failure', () => {
    const error = Object.assign(new Error('Generic Mongoose failure.'), {
      name: 'MongooseError',
    });

    expect(classifyDatabaseError(error).category).toBe('database-connection-failed');
  });

  it('handles cyclic causes safely', () => {
    const error = new Error('Unknown failure.');
    error.cause = error;

    expect(classifyDatabaseError(error)).toEqual({
      category: 'database-connection-failed',
      causeType: 'Error',
      causeCode: null,
    });
  });

  it.each([null, undefined, 'failure', 42])('handles unknown value %s safely', (value) => {
    expect(classifyDatabaseError(value)).toEqual({
      category: 'database-connection-failed',
      causeType: 'Unknown',
      causeCode: null,
    });
  });

  it('returns no messages, stacks, URI, usernames, or passwords', () => {
    const mongoUri =
      'mongodb+srv://sensitive-user:sensitive-password@cluster.example.mongodb.net/database';
    const result = classifyDatabaseError(new Error(`Driver failure for ${mongoUri}`));
    const serializedResult = JSON.stringify(result);

    expect(Object.keys(result).sort()).toEqual(['category', 'causeCode', 'causeType']);
    expect(serializedResult).not.toContain(mongoUri);
    expect(serializedResult).not.toContain('sensitive-user');
    expect(serializedResult).not.toContain('sensitive-password');
    expect(serializedResult).not.toContain('stack');
    expect(serializedResult).not.toContain('message');
  });
});
