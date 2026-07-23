const SAFE_ERROR_CODE_PATTERN = /^[A-Z\d_]+$/;

const createResolverConfigurationError = (error) => {
  const safeCause = new Error('Node.js rejected the DNS resolver configuration.');
  const code =
    typeof error?.code === 'string' && SAFE_ERROR_CODE_PATTERN.test(error.code)
      ? error.code
      : undefined;

  if (code) {
    safeCause.code = code;
  }

  const configurationError = new Error('DNS resolver configuration failed.', {
    cause: safeCause,
  });

  configurationError.category = 'dns-resolver-configuration-failed';

  if (code) {
    configurationError.code = code;
  }

  return configurationError;
};

export function configureDnsResolvers(options) {
  if (!options || !Array.isArray(options.dnsServers) || typeof options.setServers !== 'function') {
    throw createResolverConfigurationError();
  }

  const servers = [...options.dnsServers];

  if (servers.length === 0) {
    return {
      applied: false,
      servers: [],
    };
  }

  try {
    options.setServers([...servers]);
  } catch (error) {
    throw createResolverConfigurationError(error);
  }

  return {
    applied: true,
    servers,
  };
}
