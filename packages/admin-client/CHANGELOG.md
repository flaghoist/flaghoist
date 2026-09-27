# @flaghoist/admin-client

## 0.3.0

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

- d5acde8: New package: HTTP client for the Flaghoist admin API.
  
  Extracts `createAdminClient` from the CLI and collapses the dashboard's `createApi` into the same implementation. Both packages now import from this shared client rather than maintaining independent copies. The MCP server (coming in a follow-up) will use it as its third consumer.
