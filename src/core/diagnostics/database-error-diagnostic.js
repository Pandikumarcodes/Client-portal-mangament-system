const SAFE_TOKEN_PATTERN = /^[a-z\d_-]+$/i;
const DNS_RECORD_NOT_FOUND_CODES = new Set(['ENOTFOUND', 'ENODATA']);
const DNS_TIMEOUT_CODES = new Set(['ETIMEOUT', 'EAI_AGAIN']);
const AUTHENTICATION_CODES = new Set(['18', 'AUTHENTICATIONFAILED']);
const CATEGORY_PRIORITY = [
  'dns-resolver-refused',
  'dns-record-not-found',
  'dns-timeout',
  'authentication-failed',
  'server-selection-failed',
];

const safeToken = (value) => {
  const token =
    typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : typeof value === 'string'
        ? value
        : '';

  return SAFE_TOKEN_PATTERN.test(token) ? token : null;
};

const errorChain = (error) => {
  const errors = [];
  const visited = new Set();
  let current = error;

  while (current !== null && (typeof current === 'object' || typeof current === 'function')) {
    if (visited.has(current)) {
      break;
    }

    visited.add(current);
    errors.push(current);
    current = current.cause;
  }

  return errors;
};

const categoryFor = (error) => {
  const code = safeToken(error?.code)?.toUpperCase();
  const codeName = safeToken(error?.codeName)?.toUpperCase();
  const syscall = safeToken(error?.syscall)?.toLowerCase();
  const type = safeToken(error?.name)?.toLowerCase() ?? '';

  if (code === 'ECONNREFUSED' && syscall === 'querysrv') {
    return 'dns-resolver-refused';
  }

  if (DNS_RECORD_NOT_FOUND_CODES.has(code)) {
    return 'dns-record-not-found';
  }

  if (DNS_TIMEOUT_CODES.has(code)) {
    return 'dns-timeout';
  }

  if (
    AUTHENTICATION_CODES.has(code) ||
    AUTHENTICATION_CODES.has(codeName) ||
    type.includes('authentication')
  ) {
    return 'authentication-failed';
  }

  if (type.includes('serverselection')) {
    return 'server-selection-failed';
  }

  return null;
};

export function classifyDatabaseError(error) {
  const errors = errorChain(error);
  const classifiedErrors = errors.map((candidate) => ({
    candidate,
    category: categoryFor(candidate),
  }));
  const classifiedError = CATEGORY_PRIORITY.map((category) =>
    classifiedErrors.find((entry) => entry.category === category),
  ).find(Boolean);
  const diagnosticCause = classifiedError?.candidate ?? errors.at(-1);
  const category = classifiedError?.category ?? 'database-connection-failed';
  const causeType = safeToken(diagnosticCause?.name) ?? 'Unknown';
  const causeCode = safeToken(diagnosticCause?.code);

  return {
    category,
    causeType,
    causeCode,
  };
}
