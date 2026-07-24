# ADR-006: Separate Express Bootstrap from Server Lifecycle

## Status

Accepted

## Context

The backend needs a production-oriented HTTP process boundary without making application
composition dependent on a live port or database. MongoDB readiness must precede incoming HTTP
traffic, and process signals must shut down infrastructure in the reverse order. Concurrent
lifecycle calls must not create duplicate listeners or competing shutdown operations.

The frontend origin also needs centralized validation because credentials-enabled CORS cannot
safely use a wildcard.

## Decision

Separate Express application construction, infrastructure lifecycle, and executable process
policy:

- `src/app.js` exports `createApp()`, which constructs a fresh Express application, registers
  foundational middleware and infrastructure routes, and never opens a listener.
- `src/server.js` connects MongoDB before constructing Express, creates and starts the Node HTTP
  server, closes HTTP before disconnecting MongoDB, and exposes idempotent `startServer()` and
  `stopServer(reason)` operations. Active startup and shutdown promises deduplicate concurrent
  calls.
- `src/index.js` explicitly starts the server, owns SIGINT and SIGTERM registration, reports safe
  lifecycle messages, and sets process exit codes.

Add required, centrally validated `CLIENT_URL` configuration and use it as the one explicit CORS
origin with credentials enabled. A wildcard origin is not used.

Expose one `GET /api/v1/health` infrastructure route. It reports service metadata and process-level
database readiness through `isDatabaseReady()` without querying MongoDB or attempting reconnection.

Move application name and environment metadata to `src/config/application.js`. Tests and the health
route can import metadata without importing the process-starting executable entry point.

Global error handling, request correlation, structured request logging, authentication, business
routes, and further health endpoints are deferred. The backend remains one modular-monolith
process; no microservices are introduced.

## Alternatives considered

Starting Express directly from `app.js` was rejected because imports would open a port and offline
application tests would require network lifecycle management. Starting HTTP before MongoDB was
rejected because the process could accept traffic before required infrastructure was ready.

Handling signals in `server.js` was rejected because process exit policy is separate from reusable
infrastructure lifecycle. Wildcard or dynamically permissive CORS was rejected because credentials
are enabled and the current deployment has one known frontend origin.

A database query in the health route was rejected because Mongoose connection readiness is
sufficient for this increment and avoids request-time database work. Additional controller,
service, repository, microservice, and dependency-injection layers were rejected as unnecessary.

## Consequences

Express composition can be tested repeatedly without opening a permanent port or connecting to
MongoDB. Production startup accepts traffic only after the database is ready. Graceful shutdown
stops new HTTP traffic and waits for closure before database disconnection.

Repeated and concurrent lifecycle calls are safe, and successful shutdown permits a later restart.
Process-only behavior stays small and isolated in the executable entry point. CORS configuration
fails fast when `CLIENT_URL` is missing or invalid.

The health endpoint represents connection readiness only; it is not a liveness probe and does not
prove that a database query would succeed. Global HTTP error behavior, observability, authentication,
and business functionality require later decisions and implementation.
