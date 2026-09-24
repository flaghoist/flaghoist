---
'@flaghoist/core': minor
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
'@flaghoist/adapter-memory': minor
---

Add named environments. Pass `environments: ['production', 'staging', ...]` and the same flag key
can be on in one environment and off in another, each with its own audit trail, on one server and
one storage backend. The default environment keeps bare storage keys, so turning this on needs no
migration.

Admin requests choose an environment with the `X-Flaghoist-Environment` header, and
`GET /api/v1/environments` lists them. On the read path, the new `apiKeys()` verifier gives each
environment its own API key. The admin client adds an `environment` option and
`listEnvironments`, and the dashboard adds an environment switcher.
