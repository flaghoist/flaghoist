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

### Roles per environment

With [environments](/api-reference/#environments) configured and user accounts on, a member can
have a different role in some environments: a viewer who is an editor in staging, or an editor who
is read-only in production. Set it on the **Members** page or with
`flaghoist users role <email> <role> --env <environment>`. It applies to that environment's flags,
exports, imports and flag history. Members, webhooks and the security log always use the main role,
and owners have full access everywhere, so they take no environment roles. An environment role can
be higher or lower than the main role, up to admin. An access token still caps it: a token made at
viewer stays read-only in every environment. For SSO members whose main role comes from groups,
environment roles are still set in Flaghoist.

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

**Access tokens.** For the CLI, the MCP server, CI and scripts, each member creates personal
access tokens (`fh_pat_...`) on the **Account** page, or runs `flaghoist login`. A token acts as its
owner, so changes made with it are recorded under their email. Give it a lower role than your own
to limit what it can do; it can never have a higher one, and the owner's current role caps it on
every request, so demoting someone narrows their tokens and disabling or removing them stops their
tokens at once. Tokens expire after 90 days unless you choose another period, up to ten years, or
choose "never" on purpose. The server keeps only a hash and shows each token once, and lists when
each was last used. Use one anywhere the admin token went: `Authorization: Bearer fh_pat_...`,
`FLAGS_ADMIN_TOKEN` for the CLI, `FLAGHOIST_ADMIN_TOKEN` for the MCP server.

**Single sign-on.** Add `users.sso` and the sign-in screen offers **Continue with ...** your
identity provider (Okta, Microsoft Entra, Google, Auth0, Keycloak, or any OpenID Connect
provider). Setup for each is on [OIDC provider setup](/oidc-providers/#dashboard-sign-in-sso).

- **Accounts** are created at first sign-in when the email domain is in `allowedDomains` and the
  provider says the email is verified. Someone who already has a password account is linked to it
  by email; someone with an open invite joins with the invited role.
- **Roles** come from the provider when you set `roleMapping` (group name to role). They are
  applied at every sign-in, the highest mapped role wins, and they cannot be changed on the Members
  page. Someone in no mapped group is refused unless you set `defaultRole`. Without `roleMapping`,
  new people get `defaultRole` and roles are managed in Flaghoist.
- **SSO only**: `passwordSignIn: false` turns off passwords for everyone, invites included (the
  invited person signs in with SSO instead). The admin token still works, as the way back in if the
  provider is down.
- **How it is secured**: the authorization code flow with PKCE, run by the server, so a client
  secret never reaches the browser. The ID token's signature, issuer, audience, expiry and nonce
  are checked. Flaghoist uses no cookies: what the server needs when the person comes back travels
  encrypted in the `state` parameter, and the sign-in can only be finished in the tab that started
  it. The session token is never put in a URL.
- For the CLI and scripts, people who sign in with SSO create an access token on the Account page.

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

**Two-factor sign-in.** Members who sign in with a password can add a code from an authenticator
app (1Password, Google Authenticator, Authy and others) on the **Account** page: scan the QR code,
enter one code to confirm, and save the ten one-time recovery codes shown. After that, signing in
asks for the current code after the password, in the dashboard and in `flaghoist login`. A code
works once, wrong codes count toward the sign-in lockout below, and a recovery code signs in once
when the device is lost. The secret is stored encrypted with a key derived from the pepper, and
recovery codes only as hashes. A password reset link replaces the password but keeps two-factor
on.

Set `users.twoFactor` to require it: `'admins'` for admins and owners, or `'everyone'`. Someone
who must use it but has not set it up is asked to at their next sign-in, and can do nothing else
until they have, including creating access tokens. SSO sign-ins are exempt; the identity provider's
own two-factor covers them. If someone loses their device and their recovery codes, an admin turns
two-factor off for them on the **Members** page (an owner for an owner), which signs them out
everywhere; they sign in with their password and set it up again.

**Failed sign-ins.** After five failures for one email within 15 minutes, that email is locked for
30 seconds, doubling with each further failure up to 15 minutes. Thirty failures from one IP address
lock that address for 15 minutes. Unknown emails are locked and answered exactly like real ones, so
neither the response nor the lockout reveals which accounts exist.

**Security log.** Sign-ins, failed sign-ins, sign-outs, password changes and resets, invites,
member changes, access tokens created, revoked or expired, two-factor turned on, off or reset and
recovery codes used, and webhook changes go to a separate security log. Admins and owners see it under **Audit log**,
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
