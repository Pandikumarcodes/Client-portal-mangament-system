# Client Management Portal Backend

Backend foundation for a multi-tenant Client Management Portal. The project uses Node.js,
JavaScript, and ES modules, with a modular-monolith architecture direction.

## Prerequisites

- A supported Node.js LTS release
- npm

## Installation

```powershell
npm.cmd install
Copy-Item .env.example .env
```

The copied `.env` file is for local configuration. Replace its obvious MongoDB placeholder with a
developer-owned Atlas URI. Never commit or share `.env`.

## Environment configuration

Environment access is centralized in `src/config/env.js`. The module loads `.env` through dotenv,
validates and normalizes supported values with Zod, and exports an immutable configuration object.
Configuration is parsed once when the module is imported. Invalid supplied values throw a safe
error identifying the affected field without printing environment contents.

Currently supported variables:

| Variable    | Accepted values                                    | Default       | Exported value |
| ----------- | -------------------------------------------------- | ------------- | -------------- |
| `NODE_ENV`  | `development`, `test`, or `production`             | `development` | `env.nodeEnv`  |
| `PORT`      | Integer from `1` through `65535` as text           | `5000`        | `env.port`     |
| `MONGO_URI` | Required Atlas URI beginning with `mongodb+srv://` | None          | `env.mongoUri` |

`PORT` is normalized to a number. `MONGO_URI` must be non-empty, safely parseable, and contain one
valid SRV hostname without an explicit port. Application modules must import `env` instead of
reading `process.env` directly.

## Commands

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run validate
```

## MongoDB DNS preflight

After setting a real developer-owned `MONGO_URI`, run:

```powershell
npm.cmd run db:dns-check
```

The command checks which DNS resolvers Node.js sees and whether they can resolve the Atlas
`_mongodb._tcp` SRV record. It reports the cluster hostname, configured resolvers, record count,
resolved targets, and categorized DNS failures without printing the URI or credentials. It also
warns when only loopback resolvers are configured.

The preflight does not connect to MongoDB, test credentials, verify the Atlas IP access list, or
confirm database availability. A successful result proves DNS SRV discovery only; it does not prove
authentication or Atlas network access.

## Current status

The project contains the backend foundation and centralized environment validation. Express is
installed but no Express application or HTTP server startup is implemented. MongoDB Atlas URI
validation and DNS diagnostics are implemented, but no Mongoose connection or database lifecycle
exists yet.
