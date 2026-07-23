import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import * as dnsPolicy from '../../src/config/dns.js';
import { configureDnsResolvers } from '../../src/config/dns.js';

const dnsPolicySource = readFileSync(new URL('../../src/config/dns.js', import.meta.url), 'utf8');

const captureError = (operation) => {
  try {
    operation();
  } catch (error) {
    return error;
  }

  throw new Error('Expected operation to throw.');
};

describe('DNS resolver policy public API', () => {
  it('exports only configureDnsResolvers', () => {
    expect(Object.keys(dnsPolicy)).toEqual(['configureDnsResolvers']);
  });
});

describe('configureDnsResolvers', () => {
  it('does not call setServers for an empty server list', () => {
    const setServers = vi.fn();

    configureDnsResolvers({
      dnsServers: [],
      setServers,
    });

    expect(setServers).not.toHaveBeenCalled();
  });

  it('returns a structured no-op result for empty configuration', () => {
    const result = configureDnsResolvers({
      dnsServers: [],
      setServers: vi.fn(),
    });

    expect(result).toEqual({
      applied: false,
      servers: [],
    });
  });

  it('calls setServers exactly once for configured servers', () => {
    const setServers = vi.fn();

    configureDnsResolvers({
      dnsServers: ['1.1.1.1', '8.8.8.8'],
      setServers,
    });

    expect(setServers).toHaveBeenCalledOnce();
  });

  it('passes the expected string array to setServers', () => {
    const setServers = vi.fn();

    configureDnsResolvers({
      dnsServers: ['1.1.1.1', '8.8.8.8'],
      setServers,
    });

    expect(setServers).toHaveBeenCalledWith(['1.1.1.1', '8.8.8.8']);
  });

  it('passes a copied array to setServers', () => {
    const dnsServers = Object.freeze(['1.1.1.1', '8.8.8.8']);
    const setServers = vi.fn();

    configureDnsResolvers({
      dnsServers,
      setServers,
    });

    expect(setServers.mock.calls[0][0]).not.toBe(dnsServers);
  });

  it('returns a structured successful result', () => {
    const result = configureDnsResolvers({
      dnsServers: ['1.1.1.1', '8.8.8.8'],
      setServers: vi.fn(),
    });

    expect(result).toEqual({
      applied: true,
      servers: ['1.1.1.1', '8.8.8.8'],
    });
  });

  it('returns configured servers independently of the original array', () => {
    const dnsServers = Object.freeze(['1.1.1.1', '8.8.8.8']);
    const result = configureDnsResolvers({
      dnsServers,
      setServers: vi.fn(),
    });

    result.servers.push('9.9.9.9');

    expect(dnsServers).toEqual(['1.1.1.1', '8.8.8.8']);
    expect(result.servers).toEqual(['1.1.1.1', '8.8.8.8', '9.9.9.9']);
  });

  it('keeps its result independent when setServers mutates its argument', () => {
    const setServers = vi.fn((servers) => {
      servers.push('9.9.9.9');
    });

    const result = configureDnsResolvers({
      dnsServers: ['1.1.1.1', '8.8.8.8'],
      setServers,
    });

    expect(result.servers).toEqual(['1.1.1.1', '8.8.8.8']);
  });

  it('converts setServers failures into a safe error', () => {
    const resolverError = Object.assign(new Error('Unsafe original resolver message.'), {
      code: 'ERR_INVALID_IP_ADDRESS',
    });
    const configurationError = captureError(() =>
      configureDnsResolvers({
        dnsServers: ['1.1.1.1'],
        setServers: () => {
          throw resolverError;
        },
      }),
    );

    expect(configurationError).toMatchObject({
      message: 'DNS resolver configuration failed.',
      category: 'dns-resolver-configuration-failed',
      code: 'ERR_INVALID_IP_ADDRESS',
    });
    expect(configurationError.cause).not.toBe(resolverError);
    expect(configurationError.cause).toMatchObject({
      message: 'Node.js rejected the DNS resolver configuration.',
      code: 'ERR_INVALID_IP_ADDRESS',
    });
  });

  it('does not expose MongoDB credentials through a setServers failure', () => {
    const sensitiveMongoUri =
      'mongodb+srv://sensitive-user:sensitive-password@cluster.example.mongodb.net/database';
    const configurationError = captureError(() =>
      configureDnsResolvers({
        dnsServers: ['1.1.1.1'],
        setServers: () => {
          throw new Error(`Resolver failed while processing ${sensitiveMongoUri}`);
        },
      }),
    );
    const serializedError = [
      configurationError.message,
      configurationError.stack,
      configurationError.cause?.message,
      configurationError.cause?.stack,
      JSON.stringify(configurationError),
    ].join(' ');

    expect(serializedError).not.toContain(sensitiveMongoUri);
    expect(serializedError).not.toContain('sensitive-user');
    expect(serializedError).not.toContain('sensitive-password');
  });

  it('does not import DNS query APIs', () => {
    expect(dnsPolicySource).not.toContain('node:dns');
  });

  it('does not access process.env', () => {
    expect(dnsPolicySource).not.toContain('process.env');
  });
});
