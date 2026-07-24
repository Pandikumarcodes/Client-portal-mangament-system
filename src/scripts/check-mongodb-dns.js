import { getServers, resolveSrv, setServers } from 'node:dns/promises';

import { configureDnsResolvers } from '../config/dns.js';
import { checkMongoDns } from '../core/diagnostics/mongodb-dns-preflight.js';

const SAFE_TOKEN_PATTERN = /^[a-z\d_-]+$/i;
const SAFE_HOSTNAME_PATTERN = /^[a-z\d.-]+$/i;
const SAFE_DNS_SERVER_PATTERN = /^[a-f\d.:[\]%]+$/i;

const safeToken = (value) =>
  typeof value === 'string' && SAFE_TOKEN_PATTERN.test(value) ? value : null;

const safeHostname = (value) =>
  typeof value === 'string' && SAFE_HOSTNAME_PATTERN.test(value) ? value : null;

const safeDnsServers = (value) =>
  Array.isArray(value)
    ? value.filter((server) => typeof server === 'string' && SAFE_DNS_SERVER_PATTERN.test(server))
    : [];

const run = async () => {
  try {
    // Dynamic import allows environment validation errors to be handled
    // by this script's catch block.
    const { env } = await import('../config/env.js');

    // Apply the process-local DNS override before any DNS query begins.
    const resolverConfiguration = configureDnsResolvers({
      dnsServers: env.dnsServers,
      setServers,
    });

    if (resolverConfiguration.applied) {
      console.log(`DNS resolver override applied: ${resolverConfiguration.servers.join(', ')}`);
    } else {
      console.log('DNS resolver override not configured.');
    }

    // These functions now use the DNS resolver policy applied above.
    const result = await checkMongoDns({
      mongoUri: env.mongoUri,
      getServers,
      resolveSrv,
    });

    console.log('MongoDB DNS preflight passed');
    console.log(`Cluster hostname: ${result.hostname}`);
    console.log(`Configured Node DNS servers: ${result.dnsServers.join(', ') || 'none reported'}`);
    console.log(`SRV record count: ${result.records.length}`);

    for (const record of result.records) {
      console.log(`Resolved target: ${record.name}:${record.port}`);
    }

    if (result.warning) {
      console.warn(`Warning: ${result.warning}`);
    }
  } catch (error) {
    const configurationError =
      error instanceof Error && error.message.startsWith('Invalid environment configuration:');

    const category = configurationError
      ? 'invalid-environment-configuration'
      : (safeToken(error?.category) ?? 'dns-resolution-failed');

    const code = safeToken(error?.code);
    const syscall = safeToken(error?.syscall);
    const hostname = safeHostname(error?.hostname);
    const dnsServers = safeDnsServers(error?.dnsServers);

    console.error('MongoDB DNS preflight failed');
    console.error(`Diagnostic category: ${category}`);

    if (code) {
      console.error(`Error code: ${code}`);
    }

    if (syscall) {
      console.error(`Syscall: ${syscall}`);
    }

    if (hostname) {
      console.error(`Hostname: ${hostname}`);
    }

    if (dnsServers.length > 0) {
      console.error(`Configured Node DNS servers: ${dnsServers.join(', ')}`);
    }

    process.exitCode = 1;
  }
};

await run();
