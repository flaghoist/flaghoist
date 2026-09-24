---
title: Authentication
description: Guard the read and admin paths with API keys, bearer tokens, or OIDC.
---

Flaghoist has two authenticated paths, each with a pluggable verifier.

- **Read path**: apps evaluating flags. Guarded by an API key.
- **Admin path**: creating, changing, and deleting flags. Guarded by a bearer token or OIDC.

```ts
createFlagServer((env) => ({
  storage: cloudflareKV(env.FLAGS),
  auth: {
    read: apiKey(env.READ_API_KEY),
    admin: bearerToken(env.ADMIN_TOKEN),
  },
}))
```

## API key (read path)

```ts
read: apiKey(env.READ_API_KEY)
```

Clients send it as `x-api-key`. The comparison is constant-time. The read path only ever returns
evaluated booleans, never flag configuration, so this key gates drive-by scraping, not secrecy (it
ships in your browser bundle).

## Bearer token (admin, zero-config)

```ts
admin: bearerToken(env.ADMIN_TOKEN)
```

Clients send `Authorization: Bearer <token>`. Possession of the token is admin authorization: the
simplest self-host default.

Generate a strong one and never a memorable one. Anyone who guesses or steals it has full admin
access, and Flaghoist does not rate limit authentication unless you turn it on:

```bash
openssl rand -hex 32
```

**Changing the token** is a single command; it updates the live secret with no code redeploy:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Rotation is a hard cutover: the instant the secret changes, every client still holding the old token
is rejected until you update it. With one holder (you) that costs nothing. Once a team shares the
token, that is the moment to move to OIDC, below, which gives per-person identity, expiry, and
revocation instead of one secret everyone passes around. The shared token has no expiry and no second
factor by design; it is the zero-config default, not the end state.

## OIDC (admin, with your identity provider)

Validate real JWTs from Cognito, Auth0, Okta, Keycloak, or Entra, with group-based authorization:

```ts
import { oidc } from '@flaghoist/server'

admin: oidc({
  issuer: env.OIDC_ISSUER,
  audience: env.OIDC_AUDIENCE,
  groupsClaim: 'cognito:groups',
  allowedGroups: ['ADMIN', 'SUPER_ADMIN'],
  tokenUse: 'id', // Cognito id tokens
})
```

This validates the signature against the provider's JWKS with a **pinned algorithm allowlist**
(`RS256` by default; `alg: none` is always rejected), checks `iss` / `aud` / `exp` / `nbf`, and then
requires membership in an allowed group. A valid token that lacks an admin group is rejected with
`403`.

For the exact config for each provider -- issuer format, which claim carries groups, and where to
find the values in their console -- see [OIDC provider setup](/oidc-providers/).

## Roles

An admin verifier can say which role its caller has, and every admin route checks it. Roles are
cumulative: each one can do everything the roles above it in this table can.

| Role     | Can                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------- |
| `viewer` | Read flags, environments, exports and the audit log                                               |
| `editor` | Also create, edit, toggle, archive and restore flags                                              |
| `admin`  | Also delete flags, import, manage webhooks, manage members up to admin, and read the security log |
| `owner`  | Everything, including managing other owners                                                       |

A verifier that returns no role grants `owner`, which is the full access every admin verifier had
before roles existed. `bearerToken` and `oidc` return no role, so they behave exactly as they always
have. A role that is not one of the four grants nothing.

To add a role, return one from your own verifier. This gives a second, read-only token to someone
who should see the dashboard but not change anything:

```ts
const owner = bearerToken(env.ADMIN_TOKEN)
const readOnly = bearerToken(env.VIEWER_TOKEN)

admin: async (headers) => {
  const asOwner = await owner(headers)
  if (asOwner.ok) return asOwner
  const asViewer = await readOnly(headers)
  return asViewer.ok ? { ok: true, identity: 'viewer', role: 'viewer' } : asViewer
}
```

A request the caller's role does not cover is refused with `403` and
`{ "error": "This needs the editor role or higher.", "code": "insufficient_role" }`. The `code`
tells it apart from a `403` that rejects the credential itself, and the dashboard uses it to show
the message instead of signing you out.

## User accounts

Turn on accounts and people sign in to the dashboard with their own email and password. Every
change is then recorded against their email instead of a shared `admin`.

```ts
createFlagServer((env) => ({
  storage: cloudflareKV(env.FLAGS),
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKey(env.READ_API_KEY),
  },
  users: { pepper: env.AUTH_PEPPER },
}))
```

`AUTH_PEPPER` is a server secret of at least 32 characters (`openssl rand -hex 32`). Keep it in a
secret store, not in code, and back it up: without it a copy of your database reveals nothing
useful, but losing it means every password has to be set again.

Accounts are stored through your storage adapter's record store, so they live wherever your flags
do. Every bundled adapter has one. A custom adapter without `getRecord`, `putRecord`,
`deleteRecord` and `listRecords` makes the server refuse to start with `users` set, rather than
keep accounts in memory and lose them on the next restart.

**The first account.** With accounts on and none created yet, the sign-in screen asks for the admin
token. Sign in with it, open **Account**, and create the owner account. After that, sign in with
your email.

**Inviting people.** Admins and owners invite from the dashboard's **Members** page (or
`flaghoist users invite`): enter an email and a role, and Flaghoist gives you a link to pass on
yourself. It does not send email. The link works once, for that email only, for 7 days (change it
with `users.invites.expiresInDays`). Opening it lets the person choose a password and signs them
in. An open invite can be given a new link, which stops the old one working, or cancelled.

**Managing members.** From the same page, change someone's role, disable them (they are signed out
at once and cannot sign in until enabled again), or remove them. A demotion signs the member out,
so their next sign-in carries the new role. Only an owner can grant the owner role or change,
disable or remove an owner, and the last active owner cannot be demoted, disabled or removed. No
one can change their own role or remove themselves.

**Forgotten passwords.** An admin creates a reset link for the member on the **Members** page (or
`flaghoist users reset`). It works once, for 24 hours; setting a new password with it signs out
every session that member had. Admins cannot reset an owner's password; another owner, or the admin
token, can.

**The admin token stays.** `auth.admin` keeps working as a break-glass Owner credential for
recovery, and the audit log records its changes as `owner (break-glass)` so they stand out. The
dashboard offers it under **Use an access token**.

**How passwords are handled.** The password never leaves the browser. The dashboard stretches it
with PBKDF2-SHA256 (600,000 iterations, a random salt per account) and sends the result; the server
stores only an HMAC of that, keyed with the pepper. The slow part runs once per sign-in in the
browser, which keeps the server's work to well under a millisecond, inside the CPU limit of the
Cloudflare Workers free plan. Passwords need at least 12 characters and have no other rules.
Password sign-in needs HTTPS (or `localhost`), because browsers only offer the hashing there.

**Sessions.** Signing in issues a session token (`fh_sess_...`), stored on the server only as a
hash. A session ends after 30 minutes without a request or 12 hours after sign-in, whichever comes
first; change either with `users.session.idleMinutes` and `users.session.maxHours`. The **Account**
page lists your sessions and signs out any of them. Changing your password signs out all the others.
On Cloudflare KV a sign-out can take up to about a minute to reach every location, because KV
itself is eventually consistent.

**Failed sign-ins.** After five failures for one email within 15 minutes, that email is locked for
30 seconds, doubling with each further failure up to 15 minutes. Thirty failures from one IP address
lock that address for 15 minutes. Unknown emails are locked and answered exactly like real ones, so
neither the response nor the lockout reveals which accounts exist.

**Security log.** Sign-ins, failed sign-ins, sign-outs, password changes and resets, invites,
member changes and webhook changes go to a separate security log. Admins and owners see it under **Audit log**,
**Security**; see the [API reference](/api-reference/#audit-log).

## Security notes

- A **release flag is not an authorization boundary**: it controls whether a code path is visible,
  not whether a user is allowed. Keep authorization in your backend.
- **Targeting context is attacker-controlled.** Every attribute in an evaluation request is supplied
  by the caller and can be anything they choose. If a paywall flag targets `plan == "pro"` on the
  client-supplied `plan`, a caller who sends `plan: "pro"` is served the feature. Never gate anything
  that matters on a self-asserted attribute. When a targeting decision must be trustworthy, derive
  the attribute from a validated session or header and inject it through `trustedContext`, which
  overrides whatever the client sent.
- Set an exact-origin CORS allowlist (`allowedOrigins`) for the admin dashboard.

See the [threat model](https://github.com/flaghoist/flaghoist/blob/main/docs/threat-model.md) for the
full picture.
