# Agent Rules

- Work only on the requested prompt.
- Inspect existing code before changing it.
- Do not generate future modules.
- Use JavaScript and ES modules.
- Do not use CommonJS.
- Do not place business logic inside routes.
- Do not access MongoDB directly from routes.
- Every tenant-owned query must eventually include `tenantId`.
- Never commit secrets.
- Never include MongoDB credentials in logs or test fixtures.
- Access `process.env` only from `src/config/env.js`.
- Add future environment variables incrementally with the feature that requires them.
- Application code must never modify machine DNS configuration.
- Do not introduce `dns.setServers()` without an explicit architecture decision.
- Run validation before completion.
- Summarize all changed files.
- Stop after the requested prompt.
