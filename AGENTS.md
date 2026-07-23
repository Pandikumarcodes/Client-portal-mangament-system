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
- Do not access `process.env` throughout the application after centralized configuration is
  introduced.
- Run validation before completion.
- Summarize all changed files.
- Stop after the requested prompt.
