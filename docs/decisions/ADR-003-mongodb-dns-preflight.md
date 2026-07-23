# ADR-003: Add a MongoDB DNS Preflight

## Status

Accepted

## Context

MongoDB Atlas connection strings use the `mongodb+srv` scheme and depend on DNS SRV discovery.
Failures in that discovery can otherwise be mistaken for invalid database credentials, Atlas IP
access-list problems, Mongoose behavior, or application startup defects.

The application does not yet have a MongoDB connection lifecycle, so DNS behavior should be
verified independently before connection and authentication concerns are introduced.

## Decision

Require a validated `mongodb+srv` URI in centralized environment configuration and provide a
separate MongoDB DNS preflight. The preflight extracts only the cluster hostname, inspects the DNS
resolvers configured for Node.js, and resolves the corresponding `_mongodb._tcp` SRV record.

The diagnostic reports only safe metadata such as the hostname, resolver addresses, result count,
record targets, and categorized DNS failures. It never reports the MongoDB URI or credentials.
Machine DNS configuration remains outside application code, and production code does not call
`dns.setServers()`.

The reusable preflight accepts `getServers` and `resolveSrv` at its small infrastructure boundary.
This dependency injection keeps unit tests offline and deterministic. Mongoose connection and its
lifecycle are intentionally deferred to the next prompt.

## Alternatives considered

Diagnosing DNS as part of `mongoose.connect()` was rejected because it combines name resolution,
network access, authentication, and driver behavior in one failure path. Overriding DNS servers
inside the application was rejected because resolver policy belongs to the machine or deployment
environment. Real DNS requests in unit tests were rejected because they would be nondeterministic
and dependent on developer network configuration.

## Consequences

Developers can distinguish Node.js SRV resolution failures from later database connection failures.
The preflight provides actionable resolver metadata without exposing secrets or changing machine
configuration. A successful preflight confirms only DNS discovery; it does not prove MongoDB
authentication, Atlas IP access, or database availability.
