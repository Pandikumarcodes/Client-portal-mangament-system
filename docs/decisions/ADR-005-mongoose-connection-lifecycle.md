# ADR-005: Centralize the Mongoose Connection Lifecycle

## Status

Accepted

## Context

The initial modular monolith needs a reliable MongoDB connection lifecycle before HTTP startup can
be implemented. MongoDB Atlas uses SRV discovery, and some environments require the optional
process-local DNS resolver policy introduced in ADR-004. Connection failures must remain safe for
operators and must not disclose the validated URI or its credentials.

Concurrent startup calls can otherwise create duplicate connection attempts. Shutdown can also
race with startup unless the lifecycle accounts for Mongoose's disconnected, connected,
connecting, and disconnecting states.

## Decision

Use one Mongoose default connection for the initial modular monolith and centralize its lifecycle in
`src/config/database.js`. Domain modules must not create independent connections or call
`mongoose.connect()` or `mongoose.disconnect()`.

Before starting the first application-owned MongoDB connection attempt, the lifecycle applies the
configured resolver policy by passing the centrally validated `env.dnsServers` and Node.js
`setServers` function to `src/config/dns.js`. DNS policy and validation remain owned by that module;
the database lifecycle contains no hardcoded resolver addresses and performs no separate DNS
preflight.

Concurrent connection calls share one module-level promise. The lifecycle uses the validated
`env.mongoUri`, waits for Mongoose to reach its connected state, and uses a 10-second server
selection timeout for timely development feedback. More advanced connection-pool and driver tuning
is deferred until measurements justify it.

Connection and disconnection failures expose fixed public messages while preserving the original
error as `cause`. The database module does not log, terminate the process, or connect as a side
effect of import. `process.exit` and exit-code policy remain responsibilities of executable process
layers.

Future HTTP startup will establish the database connection before accepting traffic. Future
graceful shutdown will stop HTTP traffic before disconnecting MongoDB.

Initial tenant isolation will use `tenantId` fields in shared collections rather than a database
per tenant. Tenant isolation, schemas, models, and query enforcement are not implemented by this
decision.

## Alternatives considered

A connection per domain module was rejected because it fragments lifecycle ownership, complicates
resource limits, and makes startup and shutdown ordering unreliable. A database per tenant was
rejected for the initial architecture because shared collections with enforced `tenantId` scope are
the chosen first-stage isolation model.

Starting connections on module import was rejected because side effects make ordering, error
handling, shutdown, and offline testing difficult. Hardcoding resolver addresses or calling
`setServers` outside the centralized DNS policy was rejected because resolver requirements are
environment-specific. Speculative pool, socket, retry, TLS, replica-set, and authentication-source
settings were rejected in favor of the Atlas URI and driver defaults.

## Consequences

Database startup is explicit, idempotent, and testable without contacting Atlas. Duplicate calls do
not create duplicate connection attempts, readiness reflects only Mongoose's connected state, and
shutdown can safely wait for an application-owned startup attempt before disconnecting.

The future executable process layer must call the lifecycle operations in the correct HTTP startup
and shutdown order. Domain modules depend on the shared connection and must enforce tenant scope
when tenant-owned persistence is introduced later.
