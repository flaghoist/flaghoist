# @flaghoist/server

## 0.4.0

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
- ee48117: Add admin roles. An admin verifier can now return a `role` (`viewer`, `editor`, `admin` or
  `owner`), and every admin route checks it: viewers read, editors change flags, admins also delete,
  import and manage webhooks. A refused request gets a 403 with `code: "insufficient_role"`, which
  `ApiError.code` now exposes. A verifier that returns no role keeps full access, so `bearerToken`,
  `oidc` and existing custom verifiers behave exactly as before.
- 5346548: Add an audit log. Every flag create, update and delete is recorded with its actor and a before and
  after snapshot, and served at `GET /api/v1/audit` behind admin auth, with `limit`, `offset`,
  `flagKey` and `action` query parameters. Storage adapters can persist it through the new optional
  `appendAudit` and `listAudit` methods, which the memory adapter implements; otherwise the server
  keeps recent entries in memory. The dashboard gains an audit log page.
- 5346548: Redesign the dashboard: sidebar navigation, an overview page with live counts, a sortable flag
  table with search, status filters and bulk enable and disable, toast notifications, a settings
  page, and keyboard shortcuts for navigation.
- 83487f3: Add roles per environment. With environments configured, a member can have a different role in
  some of them, such as editor in staging for a viewer, or read-only in production for an editor.
  It applies to that environment's flags, exports, imports and flag history; members, webhooks and
  the security log keep using the main role, and owners have full access everywhere. Set it with
  `environmentRoles` on `PUT /api/v1/users/{id}`, on the Members page, or with
  `flaghoist users role <email> <role> --env <environment>`. Access tokens still cap it, and
  `GET /api/v1/auth/me` reports the role per environment so the dashboard follows the environment
  being viewed. Changes are recorded in the security log.
- 5346548: Add named environments. Pass `environments: ['production', 'staging', ...]` and the same flag key
  can be on in one environment and off in another, each with its own audit trail, on one server and
  one storage backend. The default environment keeps bare storage keys, so turning this on needs no
  migration.
  
  Admin requests choose an environment with the `X-Flaghoist-Environment` header, and
  `GET /api/v1/environments` lists them. On the read path, the new `apiKeys()` verifier gives each
  environment its own API key. The admin client adds an `environment` option and
  `listEnvironments`, and the dashboard adds an environment switcher.
- 5346548: Add flag export and import. `GET /api/v1/export` returns every active flag as JSON, without
  metadata; `POST /api/v1/import` creates or updates up to 500 flags from the same shape and reports
  per-flag errors without failing the batch. The admin client adds `exportFlags` and `importFlags`,
  and the dashboard adds Export and Import buttons with a preview before anything is written.
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
- 5346548: Tighten the server's Content-Security-Policy to a `default-src 'none'` baseline, and rate limit the
  dashboard at `/admin` to 30 requests per minute per IP, independent of the configurable API rate
  limiter. The dashboard now signs out after 30 minutes without activity.
- 2840fc2: Add single sign-on to the dashboard. With `users.sso` set to an OpenID Connect provider (Okta,
  Microsoft Entra, Google, Auth0, Keycloak and others), the sign-in screen offers "Continue with ..."
  and the server runs the authorization code flow with PKCE, checking the ID token's signature,
  issuer, audience, expiry and nonce. Accounts are created at first sign-in for allowed email
  domains with a verified email, linked by email to an existing account, or joined through an open
  invite. `roleMapping` lets the provider's groups decide roles at every sign-in (they then cannot be
  changed on the Members page); `defaultRole` covers people in no mapped group, who are otherwise
  refused. `passwordSignIn: false` makes sign-in SSO only, with the admin token kept as the way back
  in. No cookies are used: the sign-in state is encrypted into the `state` parameter, only the tab
  that started a sign-in can finish it, and the session token never appears in a URL.
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

### Patch Changes

- 4329bee: Label every security event in the dashboard's Security log. Invites, member changes, password reset
  links, access tokens and two-factor events now show a short badge, a plain description and a
  consistent colour instead of their raw action names.
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

## 0.3.1

### Patch Changes

- c4372c4: The weak-secret warning now fires synchronously. It previously hashed the secret with
  `crypto.subtle.digest` and logged from the resulting promise, so the warning fired on an
  unpredictable later tick and could be lost if the process exited first. The dedup key does not need
  to be cryptographic, so a plain synchronous hash makes the warning deterministic (and fixed a flaky
  test that depended on that timing). No behaviour change beyond when the line is logged.

## 0.3.0

### Minor Changes

- a996987: Optimistic concurrency on the admin API. `GET /api/v1/flags/:key` now returns an `ETag` (derived from
  the flag's `updatedAt`, which is kept strictly increasing), and `PUT /api/v1/flags/:key` honours
  `If-Match`: a write whose token no longer matches the stored flag is refused with `412 Precondition
  Failed` instead of silently overwriting another edit. `If-Match: *` requires the flag to still exist.
  A `PUT` with no `If-Match` stays unconditional (last write wins), so the CLI and existing clients are
  unaffected. The bundled dashboard sends `If-Match` on every edit and, on a conflict, reloads and asks
  the operator to reapply.

## 0.2.3

### Patch Changes

- d6e546c: Set baseline security headers on every response. The admin dashboard is now served with
  `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`, so it can no longer be
  embedded in a frame and clickjacked, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer` and a restrictive `Permissions-Policy`. These are additive and do not change the API
  behaviour; the only visible effect is that the dashboard cannot be framed, which an admin tool should
  not be.

## 0.2.2

### Patch Changes

- 6cfcd8d: Purge a legacy admin token left in `localStorage` by an older dashboard build.
  
  The token moved from `localStorage` to `sessionStorage` so it no longer persists on disk, but a
  dashboard built before that change may have already written one to `localStorage`, where the new code
  never touched it, so it lingered indefinitely, which is exactly what the move was meant to prevent.
  The dashboard now removes it once on load. New sessions have never used `localStorage`, so they are
  unaffected.

## 0.2.1

### Patch Changes

- 79243ae: Drop `Access-Control-Allow-Credentials` from CORS, and pin the opaque error response.
  
  Flaghoist authenticates with headers (`x-api-key`, `Authorization`), which a browser does not attach
  to a cross-origin request on its own, so `Access-Control-Allow-Credentials: true` bought nothing and
  was a latent hole: the day a cookie or session flow is added, an allowlisted origin could ride an
  ambient credential. An allowlisted origin still receives `Access-Control-Allow-Origin`, so
  header-authenticated cross-origin reads are unaffected. Add the credentials header back only
  alongside a deliberate credentialed flow.
  
  Also adds a test pinning the server's opaque `{ error: 'Internal server error' }` response, so a
  future change that returned an internal error message to the client would fail rather than leak.

## 0.2.0

### Minor Changes

- 4d0093e: Let a deployment stop serving the OpenAPI document.
  
  `/api/v1/openapi.json` is unauthenticated and describes every route and auth scheme, so it hands a
  scanner the API surface. Set `exposeOpenApi: false` in the config to have it return 404. It stays on
  by default, so tooling that reads the document keeps working.
  
  The admin dashboard at `/admin` was already opt-out, via `dashboard = false` in `flaghoist.toml`.
  This is obscurity rather than a security control, since the routes are open source: turn these off if
  you have no use for them, not in place of a strong admin token and rate limiting.
- 57b2c6f: Add opt-in rate limiting.
  
  Flaghoist did not throttle anything, so authentication attempts, the evaluate path, and the
  unauthenticated `/admin` payload could all be hit as fast as the network allowed. A `rateLimit` hook
  in the server config turns limiting on, applied to every route except `/health` and run before
  authentication so credential guessing is throttled too. A denied request returns `429` with a
  `Retry-After` header, and the OFREP read path treats a `429` as an error and returns the caller's
  default, so limiting it fails safe.
  
  The bundled `memoryRateLimit` counts per client IP in memory: genuinely effective on a single Node
  or container process, and per-isolate on Cloudflare Workers, where the platform's own Rate Limiting
  rules are the real answer and this is a backstop. Bring your own limiter (a Redis counter, a
  Cloudflare binding) by passing any object with a `check(key)` method, and override the bucket key
  when you have a trustworthy client identifier.
  
  Off by default: a limiter with the wrong bucket key is worse than none, and only the operator knows
  how their deployment is fronted. Existing configs are unaffected.

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
- Updated dependencies [cdc0d7b]
  - @flaghoist/core@0.1.2

## 0.1.4

### Patch Changes

- 1c6feb4: Stop a newly created flag disappearing behind the active dashboard filter.
  
  Creating a live flag while the **paused** chip was selected saved it, added it to the list, and then
  filtered it straight back out of view with no message. Nothing distinguished that from the save
  having failed silently, and the natural next move is to create the flag again.
  
  Creating a flag that the current filter or search would hide now clears them and says so. Editing an
  existing flag leaves the filter alone, since that is a view you chose on purpose.
  
  The filter predicate was also written twice, once for the list and once implicitly for the chips.
  There is now one function feeding both, so they cannot drift apart.
  
  The dashboard ships inside `@flaghoist/server`, which is why this releases there.
  
  Creating a flag is also confirmed now. The list is alphabetical, so a new flag can land below the
  fold and the closing dialog was the only sign anything had happened at all.
  
  The message strip carried `role="alert"` for everything it said. An alert is for an urgent
  interruption, so a confirmation announcing itself that way is wrong for anyone using a screen
  reader. Errors keep `role="alert"`, confirmations use `role="status"`, and the two are now
  distinguishable by colour as well.
  
  The list is ordered newest first as well. It was alphabetical, so a new flag landed wherever its
  name fell, often far below the fold in a list of any size. Ordering is on `createdAt` rather than
  `updatedAt`, so the last flag you added is the first row and editing one does not move it: sorting
  by last edit would reshuffle rows every time a toggle was flipped. The key breaks ties.
  
  Deleting a flag now asks in the page rather than through `window.confirm`. That call could not be
  relied on: Chrome offers "prevent this page from creating additional dialogs" after a few in a row,
  and once that is ticked every later call returns false with no dialog shown. Delete then did
  nothing at all, silently, which reads as a broken button rather than a refused action. Every delete
  attempted during a testing session was discarded that way, without a single request leaving the
  browser.
  
  The dialog focuses Cancel rather than Delete, so a stray Enter on a destructive prompt does nothing,
  and Escape closes it. Deleting is confirmed afterwards like any other change.

## 0.1.3

### Patch Changes

- e1bc451: Report `STATIC` rather than `DISABLED` on the OFREP wire for a disabled flag, so every language
  agrees on what the flag is worth.
  
  OpenFeature clients read `DISABLED` as "this flag is not participating, use the default you passed
  in". The Go OFREP provider acts on that: it discarded the `value: false` we sent and returned the
  caller's default instead. The JavaScript provider honoured the value. The same flag on the same
  server answered `false` in JavaScript and `true` in Go.
  
  It fails in the worst place. A kill switch is usually written as `BooleanValue(ctx, "feature", true)`,
  on unless we turn it off, so a Go service kept serving a feature after it had been disabled, while
  the dashboard showed it off.
  
  Flaghoist means something narrower than OpenFeature does. A disabled flag is off and the value is
  false, not "no opinion". `STATIC` says the value did not come from dynamic evaluation, which is
  true, and carries no instruction to substitute anything.
  
  Only the OFREP response changes. `evaluate()` still returns `DISABLED`, and the admin API is
  untouched, so nothing loses the distinction internally.

## 0.1.2

### Patch Changes

- 8aff467: Pick up patch updates to the runtime dependencies these packages ship.
  
  `@flaghoist/server` moves to `hono` 4.13.3 and `jose` 6.2.9, `flaghoist` to `smol-toml` 1.8.0, and
  `@flaghoist/provider-web` to `@openfeature/ofrep-web-provider` 0.4.3. The bumps landed on `main`
  already; without a release they sit there and nobody installing from npm gets them.
  
  No behaviour of ours changes. `@flaghoist/vue` and `create-flaghoist` come along because they depend
  on `@flaghoist/provider-web` and `flaghoist` respectively.

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

- c58f8e4: Ship the admin dashboard with `flaghoist deploy` and `flaghoist eject`, so `/admin` works out of the
  box.

  The server has always been able to serve the dashboard, through `config.dashboard`, but the CLI
  never set it. A Worker from a fresh `flaghoist deploy` answered `/admin` with "Dashboard not
  configured" and a 404, one line below where the quickstart told you to open it. The message pointed
  at a setting that could not be reached from the path the docs prescribed: there was no dashboard key
  in `flaghoist.toml` and no flag on the CLI.

  `@flaghoist/server` now exports the prebuilt single-file dashboard as `dashboardHtml` from
  `@flaghoist/server/dashboard`, and the generated Worker imports it. It is a separate entry point, so
  a deployment that does not want the UI never pulls the HTML into its bundle.

  The dashboard is on by default. Set `dashboard = false` in `flaghoist.toml` to generate a Worker
  that serves the read and admin APIs alone. Configs written before this release have no such key and
  keep serving the dashboard, which is the documented behaviour.

### Patch Changes

- Updated dependencies [e13bd69]
  - @flaghoist/core@0.1.0
