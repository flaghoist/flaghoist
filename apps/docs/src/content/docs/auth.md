---
title: Authentication
description: Guard the read and admin paths with API keys, bearer tokens, or OIDC.
---

Flaghoist has two authenticated paths, each with a pluggable verifier.

- **Read path** — apps evaluating flags. Guarded by an API key.
- **Admin path** — creating, changing, and deleting flags. Guarded by a bearer token or OIDC.

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
evaluated booleans, never flag configuration — so this key gates drive-by scraping, not secrecy
(it ships in your browser bundle).

## Bearer token (admin, zero-config)

```ts
admin: bearerToken(env.ADMIN_TOKEN)
```

Clients send `Authorization: Bearer <token>`. Possession of the token is admin authorization — the
simplest self-host default.

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

- A **release flag is not an authorization boundary** — it controls whether a code path is visible,
  not whether a user is allowed. Keep authorization in your backend.
- **Targeting context is self-asserted** by clients. When a targeting decision must be trustworthy,
  derive the attribute from a validated session and override the client value via `trustedContext`.
- Set an exact-origin CORS allowlist (`allowedOrigins`) for the admin dashboard.

See the [threat model](https://github.com/flaghoist/flaghoist/blob/main/docs/threat-model.md) for the
full picture.
