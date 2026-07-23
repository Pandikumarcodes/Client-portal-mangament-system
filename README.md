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

| Variable      | Accepted values                                    | Default       | Exported value   |
| ------------- | -------------------------------------------------- | ------------- | ---------------- |
| `NODE_ENV`    | `development`, `test`, or `production`             | `development` | `env.nodeEnv`    |
| `PORT`        | Integer from `1` through `65535` as text           | `5000`        | `env.port`       |
| `MONGO_URI`   | Required Atlas URI beginning with `mongodb+srv://` | None          | `env.mongoUri`   |
| `DNS_SERVERS` | Optional comma-separated IPv4 or IPv6 addresses    | Empty         | `env.dnsServers` |

`PORT` is normalized to a number. `MONGO_URI` must be non-empty, safely parseable, and contain one
valid SRV hostname without an explicit port. `DNS_SERVERS` is normalized into a deduplicated,
immutable array. Application modules must import `env` instead of reading `process.env` directly.

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

`DNS_SERVERS` is optional and should remain empty wherever the default resolver works. If the
current Node.js process requires an override, use a comma-separated value such as:

```dotenv
DNS_SERVERS=1.1.1.1,8.8.8.8
```

The override changes resolver behavior only for the current Node.js process. It does not change
Windows DNS settings, network-adapter configuration, or resolver behavior for other applications.
The configured policy is applied before the DNS preflight performs SRV discovery.

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
