# ADR-008: Centralize Route-Specific Request Validation

## Status

Accepted

## Context

Future modular-monolith routes will accept untrusted body, route-parameter, and query input.
Controllers must not repeat parsing or trust raw Express request values. Validation failures need to
use the existing safe HTTP error envelope without disclosing passwords, tokens, request bodies, or
other submitted values.

Express request properties also have framework-specific behavior; query values may be getter-backed
or read-only. Validation must therefore preserve raw request state and expose parsed values through
a separate contract.

## Decision

Use Zod as the request-validation boundary and apply `validateRequest` per route rather than
globally. A route may supply body, params, and query schemas together. The middleware composes those
schemas into one asynchronous parse so transforms, coercion, refinements, async refinements, and
issues across all supplied sections behave consistently.

Successful parsed output is assigned to a frozen top-level `request.validated` object containing
only the sections validated by that route. Raw `request.body`, `request.params`, and `request.query`
are not mutated. Future controllers must use the validated output instead of trusting raw input.

Zod validation failures become `ApiError` instances with HTTP 400 and code `VALIDATION_ERROR`.
Details contain only field, normalized code, and application-controlled message, retain the body,
params, or query path prefix, preserve deterministic issue order, and are limited to the first 20
issues. Raw values, issue input, credentials, and complete request data are never included. The
Zod error remains available only as the internal cause.

Unexpected non-Zod schema execution failures are forwarded unchanged so centralized HTTP error
handling produces the generic safe HTTP 500 response. Business schemas remain owned by their
modules.

Response schemas and validation of headers, cookies, and files are intentionally deferred. This
validation boundary remains part of the modular monolith.

## Alternatives considered

Mutating Express request properties with parsed output was rejected because it hides the distinction
between trusted and untrusted input and may fail with getter-backed properties. Global validation
middleware was rejected because schemas are route-specific.

Validating body, params, and query sequentially was rejected because it would stop at the first
failed section and omit other safe issues. Returning Zod errors directly was rejected because they
contain framework internals and may include raw input. Controller-owned validation was rejected
because it duplicates parsing and error conversion.

Adding business schemas, response validation, header validation, cookie validation, or file
validation was rejected until concrete module requirements exist.

## Consequences

Routes have one consistent composition pattern, controllers receive transformed and coerced values
through an explicit trusted boundary, and raw Express request state remains intact. Validation
responses are deterministic, bounded, and compatible with centralized error handling.

Future business modules must define and own their schemas, register validation on every route that
accepts input, and use `request.validated` in controllers. Application-owned schema messages must
remain safe for clients. More input sections or response validation will require later decisions.
