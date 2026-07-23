# ADR-002: Centralize Environment Configuration

## Status

Accepted

## Context

Environment variables enter the application as unvalidated strings and may be absent or invalid.
Reading them throughout the codebase would spread parsing, defaults, and error handling across
unrelated modules. It could also increase the risk of exposing secrets in logs or errors.

## Decision

Centralize environment access in `src/config/env.js`. This is the only application module permitted
to read `process.env`.

The module loads the local environment file with dotenv, then uses Zod to validate and normalize
configuration. It parses once during module import and exports one immutable `env` object for all
application consumers. Invalid supplied configuration fails fast by throwing a safe error that
identifies invalid fields without printing values. Lifecycle decisions such as calling
`process.exit` remain outside the configuration module.

Only `NODE_ENV` and `PORT` are introduced at this stage. Database, frontend-origin, authentication,
payment, email, storage, and AI configuration are intentionally deferred until the features that
require them are implemented.

## Alternatives considered

Reading `process.env` directly in each consumer was rejected because it duplicates validation and
allows inconsistent types and defaults. Parsing on every access was rejected because configuration
should have one stable value for the lifetime of the process. Manual validation was considered, but
Zod provides a concise schema with consistent validation and type coercion.

## Consequences

Application modules receive normalized camelCase values and do not handle raw environment strings.
Startup fails early when a supplied value is invalid, while error messages avoid revealing
environment contents. Tests that exercise configuration loaded at import time must reset modules
and isolate environment state. Future environment variables must be added to this module alongside
the feature that needs them.
