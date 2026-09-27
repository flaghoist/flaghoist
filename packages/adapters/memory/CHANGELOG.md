# @flaghoist/adapter-memory

## 0.2.0

### Minor Changes

- 5346548: Add an audit log. Every flag create, update and delete is recorded with its actor and a before and
  after snapshot, and served at `GET /api/v1/audit` behind admin auth, with `limit`, `offset`,
  `flagKey` and `action` query parameters. Storage adapters can persist it through the new optional
  `appendAudit` and `listAudit` methods, which the memory adapter implements; otherwise the server
  keeps recent entries in memory. The dashboard gains an audit log page.
- 5346548: Add named environments. Pass `environments: ['production', 'staging', ...]` and the same flag key
  can be on in one environment and off in another, each with its own audit trail, on one server and
  one storage backend. The default environment keeps bare storage keys, so turning this on needs no
  migration.
  
  Admin requests choose an environment with the `X-Flaghoist-Environment` header, and
  `GET /api/v1/environments` lists them. On the read path, the new `apiKeys()` verifier gives each
  environment its own API key. The admin client adds an `environment` option and
  `listEnvironments`, and the dashboard adds an environment switcher.
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

- af9fdf7: Add user accounts. Set `users: { pepper }` and people sign in to the dashboard with an email and
  password, and every change is recorded against their email. Passwords are hashed in the browser
  with PBKDF2 and never reach the server, which stores only a keyed HMAC, so sign-in fits the
  Cloudflare Workers free plan. Sessions are revocable, end after 30 idle minutes or 12 hours, and
  are listed on a new Account page along with a password change form. Failed sign-ins are throttled
  per email and per IP. The admin token stays as an Owner credential for recovery, creates the first
  account, and is recorded as `admin token`. The server refuses to start with `users` set on
  a storage adapter without the record store.
  
  Sign-ins, password changes and webhook changes go to a new security log, read with
  `GET /api/v1/audit?category=security` (admin and owner) and shown under a Security tab in the
  dashboard. `AuditEntry.flagKey` is now optional, since security entries name a `target` instead;
  flag entries always carry it, and the default audit list still returns flag changes only.
  `@flaghoist/admin-client` adds `createAuthClient`, `deriveClientKey`, and `me`, `logout`,
  `createOwner`, `changePassword` and session methods on the admin client.
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

## 0.1.2

### Patch Changes

- Updated dependencies [cdc0d7b]
  - @flaghoist/core@0.1.2

## 0.1.1

### Patch Changes

- 642917a: Give every package a README, plus the metadata npm needs to link it back here.

  npm reads `README.md` from the package directory rather than the repo root, so all eleven published
  with an empty page telling people to add one. Each package now has its own, written for someone
  landing on npm cold rather than someone who has already read the root README.

  Also adds `keywords`, `repository` (with `directory`), `homepage` and `bugs`. `flaghoist` had no
  keywords at all, so it did not come up in an npm search for feature flags, and nothing linked any
  package back to the repository or the issue tracker.

  Also drops the unused `version` export from `@flaghoist/core`. It was hardcoded to `'0.0.0'`, so it
  kept saying that after the package published as `0.1.0`. Nothing in the repo imported it, and a
  value that has to be kept in step by hand is worse than no value at all. If a version export earns
  its place later it should be generated at build time, since `createRequire` is not available in the
  Workers and browser runtimes this package targets.

- Updated dependencies [642917a]
  - @flaghoist/core@0.1.1

## 0.1.0

### Minor Changes

- e13bd69: First published release: every package goes out together at 0.1.0.

  The packages are only useful as a set, so releasing a subset would ship broken installs.
  `@flaghoist/server` depends on `@flaghoist/core`, `@flaghoist/vue` depends on
  `@flaghoist/provider-web`, `create-flaghoist` depends on `flaghoist`, and the project the CLI
  generates depends on `@flaghoist/server` plus whichever storage adapter you picked. Any of those
  left unpublished is an install failure for someone following the quickstart.

  `flaghoist --version` now reports the version from `package.json` instead of a hardcoded `0.0.0`,
  so a version in a bug report means something.

  Treat 0.1.0 as an alpha in everything but the version number: it is a real release on `latest` so
  that the documented commands work as written, but the API is not stable and will change.

### Patch Changes

- Updated dependencies [e13bd69]
  - @flaghoist/core@0.1.0
