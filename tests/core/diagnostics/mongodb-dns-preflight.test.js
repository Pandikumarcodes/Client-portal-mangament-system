import { describe, expect, it, vi } from 'vitest';

import * as mongodbDnsPreflight from '../../../src/core/diagnostics/mongodb-dns-preflight.js';
import {
  checkMongoDns,
  extractMongoSrvHostname,
} from '../../../src/core/diagnostics/mongodb-dns-preflight.js';

const mongoUri =
  'mongodb+srv://placeholder-user:placeholder-password@portfolio-cluster.example.mongodb.net/database?retryWrites=true&w=majority';
const hostname = 'portfolio-cluster.example.mongodb.net';
const srvRecords = [
  {
    name: 'shard-00-00.example.mongodb.net',
    port: 27017,
    priority: 0,
    weight: 0,
  },
];

const createDnsDependencies = ({
  dnsServers = ['1.1.1.1', '8.8.8.8'],
  records = srvRecords,
} = {}) => ({
  getServers: vi.fn(() => dnsServers),
  resolveSrv: vi.fn(async () => records),
});

const captureError = async (operation) => {
  try {
    await operation();
  } catch (error) {
    return error;
  }

  throw new Error('Expected operation to throw.');
};

describe('MongoDB DNS preflight public API', () => {
  it('exports only the hostname extractor and DNS check', () => {
    expect(Object.keys(mongodbDnsPreflight).sort()).toEqual([
      'checkMongoDns',
      'extractMongoSrvHostname',
    ]);
  });
});

describe('extractMongoSrvHostname', () => {
  it('returns only the cluster hostname', () => {
    expect(extractMongoSrvHostname(mongoUri)).toBe(hostname);
  });

  it('excludes credentials from the returned value', () => {
    const extractedHostname = extractMongoSrvHostname(mongoUri);

    expect(extractedHostname).not.toContain('placeholder-user');
    expect(extractedHostname).not.toContain('placeholder-password');
  });

  it('excludes database names and query parameters', () => {
    const extractedHostname = extractMongoSrvHostname(mongoUri);

    expect(extractedHostname).not.toContain('database');
    expect(extractedHostname).not.toContain('retryWrites');
    expect(extractedHostname).not.toContain('majority');
  });

  it('rejects a non-mongodb+srv scheme', () => {
    const unsupportedUri =
      'mongodb://placeholder-user:placeholder-password@portfolio-cluster.example.mongodb.net/database';

    expect(() => extractMongoSrvHostname(unsupportedUri)).toThrow(
      'Invalid MongoDB SRV URI: the mongodb+srv scheme is required.',
    );
  });

  it('rejects an invalid URI safely', () => {
    expect(() => extractMongoSrvHostname('mongodb+srv://missing hostname')).toThrow(
      'Invalid MongoDB SRV URI: the hostname is missing or invalid.',
    );
  });

  it('does not include supplied credentials in rejection messages', () => {
    const invalidUri = 'mongodb+srv://sensitive-user:sensitive-password@invalid hostname/database';

    let thrownError;

    try {
      extractMongoSrvHostname(invalidUri);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).not.toContain('sensitive-user');
    expect(thrownError.message).not.toContain('sensitive-password');
    expect(thrownError.message).not.toContain(invalidUri);
  });

  it('rejects multiple hosts and explicit ports for an SRV seed', () => {
    expect(() =>
      extractMongoSrvHostname(
        'mongodb+srv://placeholder-user:placeholder-password@host-one.example.net,host-two.example.net/database',
      ),
    ).toThrow('Invalid MongoDB SRV URI: the hostname is missing or invalid.');

    expect(() =>
      extractMongoSrvHostname(
        'mongodb+srv://placeholder-user:placeholder-password@host.example.net:27017/database',
      ),
    ).toThrow('Invalid MongoDB SRV URI: the hostname is missing or invalid.');
  });
});

describe('checkMongoDns', () => {
  it('builds the MongoDB SRV query', async () => {
    const dependencies = createDnsDependencies();

    const result = await checkMongoDns({
      mongoUri,
      ...dependencies,
    });

    expect(result.query).toBe(`_mongodb._tcp.${hostname}`);
  });

  it('calls the injected getServers function', async () => {
    const dependencies = createDnsDependencies();

    await checkMongoDns({
      mongoUri,
      ...dependencies,
    });

    expect(dependencies.getServers).toHaveBeenCalledOnce();
  });

  it('calls the injected resolveSrv function with the SRV query', async () => {
    const dependencies = createDnsDependencies();

    await checkMongoDns({
      mongoUri,
      ...dependencies,
    });

    expect(dependencies.resolveSrv).toHaveBeenCalledOnce();
    expect(dependencies.resolveSrv).toHaveBeenCalledWith(`_mongodb._tcp.${hostname}`);
  });

  it('normalizes successful SRV records into plain objects', async () => {
    const dependencies = createDnsDependencies({
      records: [
        {
          ...srvRecords[0],
          ttl: 60,
        },
      ],
    });

    const result = await checkMongoDns({
      mongoUri,
      ...dependencies,
    });

    expect(result.records).toEqual(srvRecords);
    expect(result.records[0]).not.toHaveProperty('ttl');
    expect(Object.getPrototypeOf(result.records[0])).toBe(Object.prototype);
  });

  it('returns multiple SRV records', async () => {
    const records = [
      ...srvRecords,
      {
        name: 'shard-00-01.example.mongodb.net',
        port: 27017,
        priority: 0,
        weight: 0,
      },
    ];
    const dependencies = createDnsDependencies({ records });

    const result = await checkMongoDns({
      mongoUri,
      ...dependencies,
    });

    expect(result.records).toEqual(records);
    expect(result.records).toHaveLength(2);
  });

  it('throws a safe diagnostic error when no SRV records are returned', async () => {
    const dependencies = createDnsDependencies({ records: [] });

    await expect(
      checkMongoDns({
        mongoUri,
        ...dependencies,
      }),
    ).rejects.toMatchObject({
      category: 'srv-record-not-found',
      hostname,
      dnsServers: ['1.1.1.1', '8.8.8.8'],
    });
  });

  it.each([
    ['ECONNREFUSED', 'querySrv', 'dns-resolver-refused'],
    ['ENOTFOUND', 'querySrv', 'srv-record-not-found'],
    ['ENODATA', 'querySrv', 'srv-record-not-found'],
    ['ETIMEOUT', 'querySrv', 'dns-timeout'],
    ['EAI_AGAIN', 'querySrv', 'dns-timeout'],
    ['EUNKNOWN', 'querySrv', 'dns-resolution-failed'],
    ['ECONNREFUSED', 'connect', 'dns-resolution-failed'],
  ])('classifies %s with syscall %s as %s', async (code, syscall, expectedCategory) => {
    const resolutionError = Object.assign(new Error('DNS resolution failed.'), {
      code,
      syscall,
    });
    const dependencies = createDnsDependencies();
    dependencies.resolveSrv.mockRejectedValue(resolutionError);

    await expect(
      checkMongoDns({
        mongoUri,
        ...dependencies,
      }),
    ).rejects.toMatchObject({
      category: expectedCategory,
      code,
      syscall,
      hostname,
      dnsServers: ['1.1.1.1', '8.8.8.8'],
    });
  });

  it('returns a warning when only loopback DNS servers are configured', async () => {
    const dependencies = createDnsDependencies({
      dnsServers: ['127.0.0.53', '::1', '[::1]:53'],
    });

    const result = await checkMongoDns({
      mongoUri,
      ...dependencies,
    });

    expect(result.success).toBe(true);
    expect(result.warning).toContain('Only loopback DNS resolvers');
  });

  it('does not return a loopback warning for public DNS servers', async () => {
    const dependencies = createDnsDependencies({
      dnsServers: ['1.1.1.1', '8.8.8.8'],
    });

    const result = await checkMongoDns({
      mongoUri,
      ...dependencies,
    });

    expect(result.warning).toBeNull();
  });

  it('does not return a loopback-only warning for mixed DNS servers', async () => {
    const dependencies = createDnsDependencies({
      dnsServers: ['127.0.0.1', '1.1.1.1'],
    });

    const result = await checkMongoDns({
      mongoUri,
      ...dependencies,
    });

    expect(result.warning).toBeNull();
  });

  it('does not expose the MongoDB URI or original resolver error', async () => {
    const resolutionError = Object.assign(new Error(`Unable to resolve ${mongoUri}`), {
      code: 'EUNKNOWN',
      syscall: 'querySrv',
    });
    const dependencies = createDnsDependencies();
    dependencies.resolveSrv.mockRejectedValue(resolutionError);

    const diagnosticError = await captureError(() =>
      checkMongoDns({
        mongoUri,
        ...dependencies,
      }),
    );
    const serializedError = [
      diagnosticError.message,
      diagnosticError.stack,
      JSON.stringify(diagnosticError),
    ].join(' ');

    expect(serializedError).not.toContain(mongoUri);
    expect(serializedError).not.toContain('placeholder-user');
    expect(serializedError).not.toContain('placeholder-password');
    expect(diagnosticError).not.toHaveProperty('cause');
  });
});
