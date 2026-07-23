const DNS_LABEL_PATTERN = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;
const SAFE_CODE_PATTERN = /^[A-Z\d_]+$/;
const SAFE_SYSCALL_PATTERN = /^[a-z\d_]+$/i;
const LOOPBACK_RESOLVER_WARNING =
  'Only loopback DNS resolvers are configured; SRV resolution depends on a local DNS service.';

const isValidHostname = (hostname) =>
  hostname.length <= 253 && hostname.split('.').every((label) => DNS_LABEL_PATTERN.test(label));

const isLoopbackResolver = (server) => {
  const normalizedServer = server.toLowerCase();

  return (
    /^127(?:\.\d{1,3}){3}(?::\d+)?$/.test(normalizedServer) ||
    normalizedServer === '::1' ||
    normalizedServer === '0:0:0:0:0:0:0:1' ||
    /^\[(?:::1|0:0:0:0:0:0:0:1)\](?::\d+)?$/.test(normalizedServer)
  );
};

const normalizeDnsServers = (servers) =>
  Array.isArray(servers) ? servers.filter((server) => typeof server === 'string') : [];

const classifyDnsFailure = (error) => {
  if (error?.code === 'ECONNREFUSED' && error?.syscall === 'querySrv') {
    return 'dns-resolver-refused';
  }

  if (error?.code === 'ENOTFOUND' || error?.code === 'ENODATA') {
    return 'srv-record-not-found';
  }

  if (error?.code === 'ETIMEOUT' || error?.code === 'EAI_AGAIN') {
    return 'dns-timeout';
  }

  return 'dns-resolution-failed';
};

const createDiagnosticError = ({ category, error, hostname, dnsServers = [] }) => {
  const diagnosticError = new Error(`MongoDB DNS preflight failed: ${category}.`);
  const code =
    typeof error?.code === 'string' && SAFE_CODE_PATTERN.test(error.code) ? error.code : undefined;
  const syscall =
    typeof error?.syscall === 'string' && SAFE_SYSCALL_PATTERN.test(error.syscall)
      ? error.syscall
      : undefined;

  diagnosticError.category = category;
  diagnosticError.dnsServers = [...dnsServers];

  if (code) {
    diagnosticError.code = code;
  }

  if (syscall) {
    diagnosticError.syscall = syscall;
  }

  if (hostname) {
    diagnosticError.hostname = hostname;
  }

  return diagnosticError;
};

export function extractMongoSrvHostname(mongoUri) {
  if (typeof mongoUri !== 'string' || !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('Invalid MongoDB SRV URI: the mongodb+srv scheme is required.');
  }

  let parsedUri;

  try {
    parsedUri = new URL(mongoUri);
  } catch {
    throw new Error('Invalid MongoDB SRV URI: the hostname is missing or invalid.');
  }

  if (
    parsedUri.protocol !== 'mongodb+srv:' ||
    parsedUri.port ||
    !parsedUri.hostname ||
    !isValidHostname(parsedUri.hostname)
  ) {
    throw new Error('Invalid MongoDB SRV URI: the hostname is missing or invalid.');
  }

  return parsedUri.hostname.toLowerCase();
}

export async function checkMongoDns(options) {
  if (
    !options ||
    typeof options.getServers !== 'function' ||
    typeof options.resolveSrv !== 'function'
  ) {
    throw createDiagnosticError({
      category: 'dns-resolution-failed',
    });
  }

  const hostname = extractMongoSrvHostname(options.mongoUri);
  const query = `_mongodb._tcp.${hostname}`;
  let dnsServers = [];
  let resolvedRecords;

  try {
    dnsServers = normalizeDnsServers(options.getServers());
    resolvedRecords = await options.resolveSrv(query);
  } catch (error) {
    throw createDiagnosticError({
      category: classifyDnsFailure(error),
      error,
      hostname,
      dnsServers,
    });
  }

  if (!Array.isArray(resolvedRecords) || resolvedRecords.length === 0) {
    throw createDiagnosticError({
      category: 'srv-record-not-found',
      hostname,
      dnsServers,
    });
  }

  const records = resolvedRecords.map(({ name, port, priority, weight }) => ({
    name,
    port,
    priority,
    weight,
  }));
  const usesOnlyLoopbackResolvers = dnsServers.length > 0 && dnsServers.every(isLoopbackResolver);

  return {
    success: true,
    hostname,
    query,
    dnsServers,
    records,
    warning: usesOnlyLoopbackResolvers ? LOOPBACK_RESOLVER_WARNING : null,
  };
}
