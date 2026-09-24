---
'@flaghoist/core': minor
'@flaghoist/adapter-memory': minor
'@flaghoist/adapter-cloudflare-kv': minor
'@flaghoist/adapter-redis': minor
'@flaghoist/adapter-sqlite': minor
'@flaghoist/adapter-postgres': minor
---

Add an optional generic record store to `StorageAdapter`: `getRecord`, `putRecord`,
`deleteRecord` and `listRecords`, holding JSON values in named collections. All five shipped
adapters implement it, each proven by the new opt-in `testRecordStorage` conformance suite.
`initSqlite` and `initPostgres` now also create a `flaghoist_records` table.

Fixes `sqliteAdapter` failing to start against a database that only has the flags table, such as
one set up with `sqliteSchema()` before webhooks existed. The webhook and record tables are now
only required when those features are used.
