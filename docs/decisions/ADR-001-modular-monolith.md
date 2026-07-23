# ADR-001: Use a Modular Monolith

## Status

Accepted

## Context

The first version of the multi-tenant Client Management Portal needs clear domain boundaries while
the product and its operational requirements are still evolving. The initial team must be able to
develop, test, deploy, and observe the backend without unnecessary distributed-system overhead.

## Decision

Build the backend as a modular monolith. Future business capabilities will be separated into
well-defined modules within one deployable Node.js application. Module boundaries will be kept
explicit so that a capability can be extracted later if scale or organizational needs justify it.

## Alternatives considered

Microservices were considered. They could provide independent deployment and scaling, but would
introduce network communication, distributed data concerns, more infrastructure, and greater
operational complexity before those costs provide a clear benefit.

An unstructured monolith was also considered, but it would make domain ownership unclear and would
increase coupling as the product grows.

## Consequences

The first version has a simpler development, testing, deployment, and operational model. Features
can share one process while retaining deliberate module boundaries. The application cannot
independently deploy or scale individual modules initially, and the team must actively enforce
boundaries to prevent unwanted coupling. A later move to services remains possible where evidence
supports it.
