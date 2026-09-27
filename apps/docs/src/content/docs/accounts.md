---
title: Accounts and team access
description: Give each person their own sign-in and role, with invites, single sign-on, two-factor codes and personal access tokens.
---

A fresh Flaghoist server has one admin token, and whoever holds it can do anything. That is fine
while it is just you. Once a team shares it, you lose track of who changed what, and rotating it
locks everyone out at once.

Turn on accounts and each person signs in with their own email, gets a role, and has their changes
recorded under their name. Everything on this page is part of the open-source server. There is no
separate edition.

## Turn on accounts

Accounts are configured in code, so you need a project you own. If you started from
`flaghoist.toml`, run `npx flaghoist eject` first; it writes `src/index.ts` on Cloudflare Workers or
`server.mjs` for a container. Then add `users` to the server config:

```ts
createFlagServer((env) => ({
  storage,
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKey(env.READ_API_KEY),
  },
  users: { pepper: env.AUTH_PEPPER },
}))
```

`AUTH_PEPPER` is a secret of at least 32 characters. Generate one and store it where your other
secrets live:

```bash
openssl rand -hex 32
```

On Cloudflare Workers that is `npx wrangler secret put AUTH_PEPPER`; on a container host it is an
environment variable. Back it up. A copy of your database is useless to an attacker without the
pepper, but if you lose it, every password has to be set again.

Accounts are kept in the same storage as your flags, through the adapter's record store. Every
bundled adapter has one. If a custom adapter does not, the server refuses to start with `users`
set, rather than keep accounts in memory and lose them on the next restart.

## Create the first owner

With accounts on and none created yet, the sign-in screen asks for the admin token. Sign in with
it, open **Account**, and create your account. It gets the owner role. From then on, sign in with
your email.

Keep the admin token. It still works as an owner credential, for recovery when nobody can sign in,
and the audit log records its changes as `admin token` so they are easy to spot.

## Roles

There are four roles. Each one can do everything the role before it can.

| Role     | Can                                                                                  |
| -------- | ------------------------------------------------------------------------------------ |
| `viewer` | See flags, environments, exports and the audit log                                   |
| `editor` | Also create, edit, toggle, archive and restore flags                                 |
| `admin`  | Also delete flags, import, manage webhooks, manage members, and see the security log |
| `owner`  | Everything, including managing other owners                                          |

The server checks the role on every request. The dashboard follows it too, so a viewer sees flags
with the switches turned off, and Members and Webhooks only appear for admins and owners.

### A different role in some environments

If you use [environments](/self-hosting/#environments), a member can have a different role in some
of them: a viewer who can edit in staging, or an editor who is read-only in production. Set it on
the Members page, or from the CLI:

```bash
npx flaghoist users role ada@example.com editor --env staging
```

An environment role applies to that environment's flags, exports, imports and history. Managing
members, webhooks and the security log always uses the main role. Owners have full access
everywhere, so they take no environment roles.

## Invite people

Admins and owners invite from the **Members** page: enter an email and a role, and you get a link
to send. The link works once, only for that email, and expires after 7 days
(`users.invites.expiresInDays` changes that). The person opens it, picks a password, and lands in
the dashboard signed in.

From the terminal:

```bash
npx flaghoist users invite ada@example.com --role editor
```

If an invite gets lost, create a new link for it; the old one stops working. You can also cancel an
open invite.

### Email invites instead of copying links

Flaghoist sends no email unless you give it a way to. Pass `users.email` an object with a `send`
method, and invites and password reset links are emailed as well as shown. There is no bundled
email provider; anything with an HTTP API works. With Resend:

```ts
users: {
  pepper: env.AUTH_PEPPER,
  email: {
    async send({ to, subject, text, html }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from: 'Flaghoist <flags@acme.com>', to, subject, text, html }),
      })
      if (!res.ok) throw new Error(`Resend answered ${res.status}`)
    },
  },
},
```

Postmark works the same way: post to `https://api.postmarkapp.com/email` with an
`X-Postmark-Server-Token` header and a body of `{ From, To, Subject, TextBody, HtmlBody }`. If
sending fails, the error is logged and the link is still shown to the admin, so nobody is stuck.

## Manage members

From the Members page you can change someone's role, disable them, or remove them.

- Disabling someone signs them out straight away and stops their access tokens. Enable them again
  to let them back in.
- Demoting someone also signs them out, so they come back with the new role.
- Only an owner can make someone an owner, or change, disable or remove an owner.
- The last active owner cannot be demoted, disabled or removed, and nobody can change their own
  role or remove themselves.

The same actions are in the CLI: `flaghoist users list`, `role`, `disable`, `enable`, `remove`. See
the [CLI reference](/cli/#members).

### Forgotten passwords

An admin creates a reset link for the member on the Members page, or with
`flaghoist users reset <email>`. It works once, for 24 hours, and setting a new password signs out
every session that member had. An admin cannot reset an owner's password; another owner can, or
the admin token.

## Sign in with your identity provider

Add `users.sso` and the sign-in screen offers **Continue with** your provider: Okta, Microsoft
Entra, Google Workspace, Auth0, Keycloak, or anything that speaks OpenID Connect.

```ts
users: {
  pepper: env.AUTH_PEPPER,
  sso: {
    issuer: 'https://acme.okta.com',
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    label: 'Okta',
    allowedDomains: ['acme.com'],
    roleMapping: { 'flag-admins': 'admin', engineering: 'editor' },
  },
},
```

Register `https://<your server>/api/v1/auth/sso/callback` as the redirect URL in your provider.
[OIDC provider setup](/oidc-providers/#dashboard-sign-in-sso) has the steps for each one.

How it behaves:

- **New people** get an account on their first sign-in, as long as their email domain is in
  `allowedDomains` and the provider says the email is verified. Someone who already has a password
  account is linked to it by email. Someone with an open invite joins with the invited role.
- **Roles** come from the provider's groups when you set `roleMapping`. They are applied at every
  sign-in, the highest mapped role wins, and they cannot be changed on the Members page. Someone in
  no mapped group is refused, unless you set `defaultRole`. Without `roleMapping`, new people get
  `defaultRole` and you manage roles in Flaghoist.
- **SSO only:** set `passwordSignIn: false` to turn passwords off for everyone. Invited people then
  join by signing in with SSO. The admin token still works, in case the provider is down.

The server runs the sign-in itself (the authorization code flow with PKCE), so a client secret
never reaches the browser, and it checks the ID token's signature, issuer, audience, expiry and
nonce. No cookies are used, and the session token never appears in a URL.

## Two-factor codes

Anyone who signs in with a password can add a code from an authenticator app (1Password, Google
Authenticator, Authy and others). On the **Account** page, scan the QR code, enter one code to
confirm, and save the ten recovery codes it shows. From then on, signing in asks for a code after
the password, in the dashboard and in `flaghoist login`.

Each code works once, and wrong codes count toward the sign-in lockout. A recovery code gets you in
once if you lose your phone.

To make it required, set `users.twoFactor` to `'admins'` (admins and owners) or `'everyone'`. Anyone
who has to use it but has not set it up is asked to straight after signing in, and can do nothing
else until they have. People who sign in with SSO are exempt, because the identity provider's own
two-factor already covers them.

If someone loses their phone and their recovery codes, an admin can turn two-factor off for them on
the Members page. That signs them out everywhere; they sign in with their password and set it up
again.

## Access tokens for the CLI, CI and scripts

Each member can create personal access tokens on the **Account** page. A token acts as the person
who made it, so changes made with it are recorded under their name.

- Give a token a lower role than your own to limit what it can do. It can never have a higher one.
- Tokens expire after 90 days by default. You can pick up to ten years, or no expiry if you really
  mean it.
- The token is shown once. After that the list shows its first few characters and when it was last
  used.
- If the owner is demoted, their tokens are narrowed to match. If they are disabled or removed,
  their tokens stop working.

Use a token anywhere the admin token went: `Authorization: Bearer fh_pat_...`, `FLAGS_ADMIN_TOKEN`
for the CLI, or `FLAGHOIST_ADMIN_TOKEN` for the MCP server.

`flaghoist login` creates one for you from your email and password, and saves it so later commands
need no token:

```bash
npx flaghoist login --url https://flags.example.com --email ada@example.com
```

## Sessions and passwords

- Passwords need at least 12 characters, with no other rules.
- The password never leaves the browser. The dashboard stretches it with PBKDF2 (600,000 rounds)
  and sends only the result, and the server stores a keyed hash of that. The server's work per
  sign-in is well under a millisecond, which keeps it inside the CPU limit of the Cloudflare
  Workers free plan. Because of the hashing, password sign-in needs HTTPS (or `localhost`).
- A session ends after 30 minutes without a request, or 12 hours after sign-in, whichever comes
  first. `users.session.idleMinutes` and `users.session.maxHours` change those.
- The Account page lists your sessions and signs out any of them. Changing your password signs out
  the others.
- After five wrong passwords for one email in 15 minutes, that email is locked for 30 seconds, and
  the lock doubles with each further failure up to 15 minutes. Thirty failures from one IP address
  lock it for 15 minutes. Unknown emails get exactly the same answers and lockouts, so neither
  reveals which accounts exist.
- On Cloudflare KV, a sign-out or a disabled account can take up to about a minute to reach every
  location, because KV itself is eventually consistent. Redis, Postgres and SQLite apply it at once.

## The security log

Sign-ins and failed sign-ins, password changes and resets, invites, member changes, access tokens,
two-factor changes and webhook changes go to a separate security log. Admins and owners see it on
the **Audit log** page, under **Security**. Flag changes stay in the main audit log, now recorded
against each person's email.

Webhooks can also be told about team changes (someone invited, joined, changed role, disabled or
removed). These events are opt-in; see [the API reference](/api-reference/#member-events).
