# Client Management Portal Backend

## Product purpose

This project is the backend foundation for a multi-tenant Client Management Portal serving Super
Admins, Organization Admins, and Clients.

## Current status

Prompt 1 establishes the Node.js, JavaScript, ES module, testing, linting, and formatting
foundation. Express startup, MongoDB configuration, authentication, external integrations, and
business modules are not implemented.

## Prerequisites

- A supported Node.js LTS release
- npm

## Commands

Install dependencies:

```sh
npm install
```

Run the development entry point with Nodemon:

```sh
npm run dev
```

Run all validation:

```sh
npm run validate
```

Run tests once:

```sh
npm test
```

## Current directory structure

```text
.
|-- docs/
|   |-- architecture/
|   |   `-- system-context.md
|   `-- decisions/
|       `-- ADR-001-modular-monolith.md
|-- src/
|   `-- index.js
|-- tests/
|   `-- foundation.test.js
|-- .env.example
|-- .gitignore
|-- .prettierignore
|-- .prettierrc.json
|-- AGENTS.md
|-- eslint.config.js
|-- package.json
`-- README.md
```

## Architecture direction

The backend will evolve as a modular monolith: one deployable application with explicit internal
module boundaries. This keeps the first version operationally simple while preserving a path to
extract services if justified later.

Express is installed as a dependency but no Express application or HTTP server startup exists.
MongoDB is planned, but Mongoose is not configured and no database connection exists.
