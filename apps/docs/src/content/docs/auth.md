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
