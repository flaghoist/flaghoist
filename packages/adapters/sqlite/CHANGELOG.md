# @flaghoist/adapter-sqlite

## 0.3.0

### Minor Changes

- 479223a: Add an optional generic record store to `StorageAdapter`: `getRecord`, `putRecord`,
  `deleteRecord` and `listRecords`, holding JSON values in named collections. All five shipped
  adapters implement it, each proven by the new opt-in `testRecordStorage` conformance suite.
  `initSqlite` and `initPostgres` now also create a `flaghoist_records` table.
  
  Fixes `sqliteAdapter` failing to start against a database that only has the flags table, such as
  one set up with `sqliteSchema()` before webhooks existed. The webhook and record tables are now
  only required when those features are used.
- 5346548: Add webhooks. Manage endpoints under `/api/v1/webhooks` or from the dashboard's Webhooks page. Each
  flag create, update, delete, archive or restore sends a `POST` signed with HMAC-SHA256 in
  `X-Flaghoist-Signature`, using a secret generated per endpoint. Delivery is fire-and-forget with a
  10 second timeout and no retries.
  
  Storage adapters persist endpoints through new optional `putWebhook`, `getWebhook`,
  `deleteWebhook` and `listWebhooks` methods, which all five shipped adapters implement.
  `initSqlite` and `initPostgres` also create a `flaghoist_webhooks` table.

### Patch Changes

- Updated dependencies [c7c4e6e]
- Updated dependencies [5346548]
- Updated dependencies [5346548]
- Updated dependencies [5346548]
- Updated dependencies [df25e09]
- Updated dependencies [e16e668]
- Updated dependencies [479223a]
- Updated dependencies [3f47819]
- Updated dependencies [af9fdf7]
- Updated dependencies [5346548]
  - @flaghoist/core@0.2.0

## 0.2.0

### Minor Changes

- efebd4e: Add SQLite StorageAdapter. Stores flags in a single SQLite table via any better-sqlite3-compatible
  driver. All four StorageAdapter methods are covered by the shared conformance suite.

## 0.1.0

### Minor Changes

- Initial release: SQLite StorageAdapter for Flaghoist.
