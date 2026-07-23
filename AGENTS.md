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
- Access `process.env` only from `src/config/env.js`.
- Add future environment variables incrementally with the feature that requires them.
- Run validation before completion.
- Summarize all changed files.
- Stop after the requested prompt.
