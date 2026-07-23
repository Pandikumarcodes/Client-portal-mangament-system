# ADR-004: Make Node.js DNS Resolvers Configurable

## Status

Accepted

## Context

On the local Windows development machine, Node.js reported `127.0.0.1` as its DNS resolver even
though the Wi-Fi adapter was configured with public resolvers. MongoDB Atlas SRV discovery failed
through the loopback resolver, while the same SRV record resolved successfully after Node.js was
manually configured with public resolvers.

DNS behavior varies by machine and deployment environment. Resolver policy must therefore remain
separate from the future MongoDB connection lifecycle and must not be hardcoded in database code.

## Decision

Introduce an optional `DNS_SERVERS` environment variable containing comma-separated IPv4 or IPv6
addresses. Centralized environment configuration parses, validates, deduplicates, and freezes this
list.

Isolate Node.js `dns.setServers()` behind `src/config/dns.js`. The DNS preflight applies this policy
before inspecting resolvers or performing MongoDB SRV discovery. Environments whose default
resolver works correctly leave `DNS_SERVERS` empty, in which case no override occurs.

This decision supersedes ADR-003's earlier rejection of application-level resolver overrides by
introducing a narrowly scoped, explicit, and environment-controlled policy.

The policy affects only DNS resolution inside the current Node.js process. Application code does
not modify Windows network-adapter settings, and the future database module will not own or apply
DNS policy directly.

## Alternatives considered

Hardcoding public resolvers was rejected because resolver requirements differ across environments.
Calling `dns.setServers()` from the future database module was rejected because it would couple
machine infrastructure policy to MongoDB connection lifecycle. Changing Windows adapter settings
from application code or PowerShell was rejected because operating-system networking remains an
administrator and deployment concern.

## Consequences

Developers can explicitly bypass a failing process-level resolver without changing the machine.
Resolver configuration is validated and applied before SRV lookup, and correct environments retain
their existing resolver behavior by leaving the variable empty.

When explicitly enabled, the application may bypass an organization-managed DNS resolver. Operators
must therefore choose resolver addresses according to their environment's networking, security,
and compliance requirements.
