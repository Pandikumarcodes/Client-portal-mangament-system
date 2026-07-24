# ADR-007: Centralize HTTP Error Handling

## Status

Accepted

## Context

The modular-monolith HTTP boundary needs one predictable failure contract before business routes
are introduced. Allowing individual handlers to shape failures would duplicate response logic,
encourage repeated try/catch blocks, and increase the risk of returning dependency messages,
credentials, stack traces, or other infrastructure details.

Express also produces framework errors for malformed JSON and oversized request bodies. These need
the same safe client-facing contract as application errors.

## Decision

Use one JSON error envelope containing `success: false` and a public error code and message.
`ApiError` represents expected client-facing operational failures and may carry explicitly supplied
safe details. Business-specific error codes will be added incrementally with the modules that need
them.

Register centralized not-found middleware after all routes and global error middleware last in
application composition. Unknown failures become HTTP 500 `INTERNAL_SERVER_ERROR` responses with a
generic message. Development mode does not expose additional error detail over HTTP.

Normalize Express malformed-JSON errors to HTTP 400 `INVALID_JSON` and body-size errors to HTTP 413
`PAYLOAD_TOO_LARGE`. Internal messages, raw errors, causes, stacks, credentials, request secrets,
and infrastructure details are never returned to clients.

Asynchronous route handlers will use the small `asyncHandler` helper to forward synchronous throws
and rejected promises to centralized middleware instead of repeating try/catch blocks. Response
generation and future structured logging remain separate responsibilities.

Request-validation schemas and validation middleware are intentionally deferred. The design remains
inside the existing modular monolith and introduces no service boundary.

## Alternatives considered

Sending errors directly from each route was rejected because it fragments the response contract and
makes safe-data policy difficult to enforce. Returning raw errors in development was rejected
because clients must never receive stacks, causes, credentials, or infrastructure details in any
environment.

Multiple application-error subclasses, a general error registry, and a package of speculative error
codes were rejected because there is no demonstrated business requirement for those abstractions.
Logging inside the response middleware was rejected because observability policy belongs to a later
increment.

## Consequences

Clients receive deterministic JSON for unmatched routes, known application errors, body-parser
errors, and unknown failures. Routes can forward errors without knowing response formatting, and
future asynchronous handlers can avoid repetitive error plumbing.

The error middleware must remain last, routes must provide only safe public messages and details,
and new business codes must be introduced deliberately. Internal diagnostics will require a future
logging design because this response layer intentionally emits no logs and reveals no internal
failure context.
