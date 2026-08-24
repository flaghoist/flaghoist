---
'@flaghoist/server': minor
---

Let a deployment stop serving the OpenAPI document.

`/api/v1/openapi.json` is unauthenticated and describes every route and auth scheme, so it hands a
scanner the API surface. Set `exposeOpenApi: false` in the config to have it return 404. It stays on
by default, so tooling that reads the document keeps working.

The admin dashboard at `/admin` was already opt-out, via `dashboard = false` in `flaghoist.toml`.
This is obscurity rather than a security control, since the routes are open source: turn these off if
you have no use for them, not in place of a strong admin token and rate limiting.
