# @flaghoist/core

## 0.2.0

### Minor Changes

- c7c4e6e: Add personal access tokens. Members create `fh_pat_` tokens for the CLI, the MCP server and
  scripts, from the Account page or `POST /api/v1/tokens`. A token acts as its owner, so changes are
  attributed to them; it can have a lower role than its owner but never a higher one, and the owner's
  current role caps it on every request, so demoting, disabling or removing someone narrows or stops
  their tokens. Tokens expire after 90 days by default (1 to 3650 days, or never on purpose), are
  stored only as hashes, show when they were last used, and are audited when created, revoked or
  expired.
  
  The CLI adds `flaghoist login` (email and password, hashed locally; saves a token in the user
  config folder, readable only by you), `flaghoist logout` (revokes it), and
  `flaghoist tokens list | create | revoke`. Commands fall back to the saved token when no `--token`
  or `FLAGS_ADMIN_TOKEN` is given.
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
- 5346548: Add archiving and change descriptions.
  
  - Archive a flag with `POST /api/v1/flags/:key/archive` and bring it back with `.../restore`. An
    archived flag keeps its definition but evaluates as disabled and is left out of
    `GET /api/v1/flags` unless `?includeArchived=true` is passed. `FeatureFlag` gains optional
    `archived` and `archivedAt` fields.
  - A flag write can carry an optional `changeDescription`, recorded on its audit entry.
  - The admin client adds `archive`, `restore`, an `includeArchived` list option and a
    `changeDescription` put option. The dashboard adds archive, restore and a reason field on edits.
- df25e09: Add member events on webhooks and an optional email sender. Webhooks can subscribe to
  `member.invited`, `member.joined`, `member.role_changed`, `member.disabled`, `member.enabled` and
  `member.removed`, with a `member` object in the payload. They are opt-in and never part of the
  default event list, so existing receivers only ever see flag events. Sign-ins, passwords, two-factor
  and access tokens are never sent to webhooks.
  
  `users.email` takes an object with `send({ to, subject, text, html })`; invites and password reset
  links are then emailed as well as shown, to the dashboard address the admin is using when its origin
  is allowed. No provider is bundled; the docs show Resend and Postmark in a few lines. A failed send
  is logged and the link still returned, and responses say whether the link was `emailed`.
- e16e668: Add invites and member management for user accounts. Admins create single-use invite links
  (bound to one email, valid 7 days by default via `users.invites.expiresInDays`) and pass them on
  themselves; opening one sets a password and signs in. A new Members page and
  `flaghoist users` commands change roles, disable, enable and remove members, and create 24-hour
  password reset links that sign out the member's other sessions. Only an owner can grant or act on
  the owner role, the last active owner cannot be demoted, disabled or removed, and nobody can
  change their own role. Demoting or disabling a member signs them out. Link tokens are stored only
  as hashes. Every change is recorded in the security log.
  
  The dashboard now follows the signed-in role: viewers see flags read-only, editors do not see
  import or delete, and Webhooks and Members appear only for admins and owners.
- 479223a: Add an optional generic record store to `StorageAdapter`: `getRecord`, `putRecord`,
  `deleteRecord` and `listRecords`, holding JSON values in named collections. All five shipped
  adapters implement it, each proven by the new opt-in `testRecordStorage` conformance suite.
  `initSqlite` and `initPostgres` now also create a `flaghoist_records` table.
  
  Fixes `sqliteAdapter` failing to start against a database that only has the flags table, such as
  one set up with `sqliteSchema()` before webhooks existed. The webhook and record tables are now
  only required when those features are used.
- 3f47819: Add two-factor sign-in for password accounts. Members set up codes from an authenticator app on
  the Account page (a QR code, one confirming code, and ten recovery codes shown once); signing in
  then asks for the current code after the password, in the dashboard and in `flaghoist login`
  (`--code` where there is no terminal). Codes work once, wrong codes count toward the sign-in
  lockout, recovery codes are single use, the secret is stored encrypted with a key derived from the
  pepper, and recovery codes only as hashes. `users.twoFactor: 'admins' | 'everyone'` makes it
  required; anyone who must have it is asked to set it up at their next sign-in and can do nothing
  else until they have. SSO sign-ins are exempt. Admins can turn it off for a member who lost their
  device, which signs them out everywhere. All of it is recorded in the security log.
  
  `signIn` and `acceptLink` in `@flaghoist/admin-client` now return a `TwoFactorChallenge` for such
  accounts; check with `isTwoFactorChallenge` and finish with `completeTwoFactor`.
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
- 5346548: Add webhooks. Manage endpoints under `/api/v1/webhooks` or from the dashboard's Webhooks page. Each
  flag create, update, delete, archive or restore sends a `POST` signed with HMAC-SHA256 in
  `X-Flaghoist-Signature`, using a secret generated per endpoint. Delivery is fire-and-forget with a
  10 second timeout and no retries.
  
  Storage adapters persist endpoints through new optional `putWebhook`, `getWebhook`,
  `deleteWebhook` and `listWebhooks` methods, which all five shipped adapters implement.
  `initSqlite` and `initPostgres` also create a `flaghoist_webhooks` table.

## 0.1.2

### Patch Changes

- cdc0d7b: Three hardening fixes from a security audit.
  
  The admin dashboard now keeps the session token in `sessionStorage` rather than `localStorage`, so
  the token dies with the browser tab instead of sitting on disk. It is full admin authority with no
  expiry, and `localStorage` is readable by any script on the origin, so a smaller window is the safer
  default. The sign-in URL field already defaults to the current origin, so nothing is lost by not
  persisting it.
  
  A flag description is now bounded to 2048 characters. It was unbounded within the 64KB request body
  limit, so an authenticated writer could bloat every `list()` and every dashboard load, since the
  list returns full flag bodies with no pagination. `parseFlag` rejects a flag over the cap and the
  admin write path returns a specific error.
  
  `apiKey` and `bearerToken` warn once, to the server log, when the shared secret is under 16
  characters. Flaghoist does not rate limit authentication, so a short token is guessable; the warning
  is guidance rather than a wall, since rejecting a short secret outright could lock an operator out of
  a running service. The secret is never retained: the dedupe key is a short hash of it.

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
