---
title: OIDC provider setup
description: Dashboard SSO and oidc() configs for Okta, Entra, Google, Auth0, Keycloak, Cognito and Cloudflare Access.
---

This page covers two different things:

- **Dashboard sign-in (SSO)**: people click **Continue with ...** on the dashboard and sign in with
  your identity provider. Configured under `users.sso`. See
  [the next section](#dashboard-sign-in-sso).
- **The `oidc()` verifier**: API clients that already hold a JWT from your provider send it as a
  bearer token. The recipes after that section cover it.

## Dashboard sign-in (SSO)

Needs [user accounts](/auth/#user-accounts) turned on. In every provider:

1. Create an **OpenID Connect web application** (a confidential client with a client secret is
   the usual choice; a public client with PKCE also works).
2. Add the redirect URI `https://<your server>/api/v1/auth/sso/callback`. It must match exactly.
3. Make sure ID tokens carry `email` and, for role mapping, the person's groups.
4. Put the issuer, client ID and client secret in `users.sso`, keeping the secret in a secret store.

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

Notes per provider:

- **Okta**: create an app integration of type OIDC, Web Application. The issuer is your org URL
  (`https://acme.okta.com`) or a custom authorization server's issuer URI. To send groups, add a
  groups claim to the ID token (for the org server, the app's **Sign On** tab has a groups claim
  filter); some setups also need `scopes: ['openid', 'email', 'profile', 'groups']`.
- **Microsoft Entra**: register an app with a **Web** redirect URI and a client secret. The issuer
  is `https://login.microsoftonline.com/<tenant-id>/v2.0`. Use App Roles with
  `groupsClaim: 'roles'`, since the groups claim holds object IDs rather than names. Entra's ID
  tokens do not include `email_verified`, so set `requireVerifiedEmail: false` together with
  `allowedDomains`, and keep the app single-tenant.
- **Google Workspace**: create an OAuth client of type Web application. The issuer is
  `https://accounts.google.com`. Google does not send groups, so use `defaultRole` with
  `allowedDomains` set to your Workspace domain, and set individual roles by invite.
- **Auth0**: create a Regular Web Application. The issuer is `https://<tenant>.auth0.com/`,
  **with** the trailing slash. Add groups or roles to the ID token with an Action under a
  namespaced claim, and point `groupsClaim` at it (for example `'https://acme.com/roles'`).
- **Keycloak**: create an OpenID Connect client with client authentication on. The issuer is
  `https://<host>/realms/<realm>`. Add a **Group Membership** mapper to the client with "Add to ID
  token" on and "Full group path" off.

Test it with one account in a mapped group before switching `passwordSignIn` off.

## The oidc() verifier

Each recipe below gives the exact `oidc({ ... })` call for that provider, plus where to find
each value in their console. The options are documented in full on the [Authentication](/auth/) page.

## AWS Cognito

Use the **ID token** (`tokenUse: 'id'`). Cognito puts group membership in `cognito:groups` on the ID
token; the access token does not carry it.

```ts
import { oidc } from '@flaghoist/server'

admin: oidc({
  issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX',
  audience: 'your-app-client-id',
  tokenUse: 'id',
  groupsClaim: 'cognito:groups',
  allowedGroups: ['flaghoist-admins'],
})
```

**Where to find the values:**

- **Issuer** -- AWS Console > Cognito > User pools > [your pool]. The User pool ID is the last
  segment (`us-east-1_XXXXXXXXX`). Construct: `https://cognito-idp.<region>.amazonaws.com/<pool-id>`.
- **Audience** -- Same pool > App integration > App clients > [your client] > **Client ID**.
- **Group name** -- Same pool > Groups > [group name]. The value is the group name as typed, not an ID.

Your app client must **not** use a client secret (i.e. it is a public or SPA client) or you must
request tokens server-side with the secret, because the token must be forwarded to Flaghoist as a
bearer token.

---

## Auth0

Auth0 does not include roles or groups in tokens by default. You need a **Post Login Action** that
adds them as a namespaced custom claim. Auth0 requires custom claims to use a URL as the key.

```ts
admin: oidc({
  issuer: 'https://your-tenant.auth0.com/',
  audience: 'https://api.example.com/flaghoist',
  groupsClaim: 'https://api.example.com/roles',
  allowedGroups: ['flaghoist-admin'],
})
```

**Where to find the values:**

- **Issuer** -- Auth0 Dashboard > Applications > APIs > [your API] > Quick Start. The issuer is
  your tenant domain with a trailing slash: `https://<tenant>.auth0.com/`.
- **Audience** -- Same API > Settings > **Identifier** (the API URL you set when creating the API).
- **Roles claim** -- You choose the name; it must be a URL. Add it in Auth0 Dashboard > Actions >
  Library > Create Action > Post Login, with code like:

  ```js
  exports.onExecutePostLogin = async (event, api) => {
    const roles = event.authorization?.roles ?? []
    api.accessToken.setCustomClaim('https://api.example.com/roles', roles)
  }
  ```

  Assign roles to users in Auth0 Dashboard > User Management > Users > [user] > Roles.

---

## Okta

Use a **Custom Authorization Server** (not the Org AS). The default server is fine for most setups.
Add a groups claim to the access token in the server's Claims config.

```ts
admin: oidc({
  issuer: 'https://your-org.okta.com/oauth2/default',
  audience: 'api://default',
  groupsClaim: 'groups',
  allowedGroups: ['FlaghoistAdmins'],
})
```

**Where to find the values:**

- **Issuer** -- Okta Admin Console > Security > API > Authorization Servers > [server] >
  **Issuer URI**.
- **Audience** -- Same server > Settings > **Audience** (default is `api://default`).
- **Groups claim** -- Same server > Claims > Add Claim:
  - Name: `groups`
  - Include in token type: Access Token
  - Value type: Groups
  - Filter: Matches regex `.*` (or a tighter prefix)

  Okta group names are plain strings; use those in `allowedGroups`.

---

## Keycloak

Keycloak does not add the client to the `aud` claim or groups to the token by default. You need two
mappers on the client.

```ts
admin: oidc({
  issuer: 'https://your-keycloak.example.com/realms/your-realm',
  audience: 'flaghoist',
  groupsClaim: 'groups',
  allowedGroups: ['/flaghoist-admins'],
})
```

**Where to find the values:**

- **Issuer** -- Keycloak Admin > [realm] > Realm settings > General > **OpenID Endpoint
  Configuration** (or construct: `https://<host>/realms/<realm>`).
- **Audience** -- The client ID you created under Clients.
- **Audience mapper** -- Clients > [client] > Client scopes > [client]-dedicated > Add mapper >
  By configuration > **Audience**. Set "Included Client Audience" to your client ID.
- **Groups mapper** -- Same scope > Add mapper > By configuration > **Group Membership**. Set
  "Token Claim Name" to `groups` and disable "Full group path" unless you want the `/` prefix.

  Keycloak top-level group paths start with `/` (e.g. `/flaghoist-admins`). Match exactly what
  Keycloak puts in the token.

---

## Microsoft Entra (Azure AD)

Use **App Roles** rather than the native groups claim. The groups claim returns object IDs (GUIDs),
not names. App Roles return the role value you define.

```ts
admin: oidc({
  issuer: 'https://login.microsoftonline.com/your-tenant-id/v2.0',
  audience: 'your-application-client-id',
  groupsClaim: 'roles',
  allowedGroups: ['FlagAdmin'],
})
```

**Where to find the values:**

- **Tenant ID** -- Azure Portal > Microsoft Entra ID > Overview > **Tenant ID**.
  Issuer: `https://login.microsoftonline.com/<tenant-id>/v2.0`.
- **Audience (client ID)** -- App registrations > [your app] > **Application (client) ID**.
- **App roles** -- App registrations > [your app] > App roles > Create app role:
  - Display name: e.g. `Flag Admin`
  - Allowed member types: Users/Groups
  - Value: `FlagAdmin` (this is what appears in the `roles` claim)

  Assign the role to users or groups: Enterprise applications > [your app] > Users and groups >
  Add user/group.

The `roles` claim is only present when the user has been assigned an app role. A token with no
matching role is rejected with `403`.

---

## Cloudflare Access

Cloudflare Access sends its JWT in the `Cf-Access-Jwt-Assertion` request header, not
`Authorization: Bearer`. The `oidc()` verifier reads from the `Authorization` header, so you need
to forward the Access JWT into it before the request reaches Flaghoist.

Add this to your Worker entry before the Flaghoist handler:

```ts
// Forward the CF Access JWT as a Bearer token so oidc() can read it.
async fetch(request, env, ctx) {
  const cfJwt = request.headers.get('Cf-Access-Jwt-Assertion')
  if (cfJwt) {
    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${cfJwt}`)
    request = new Request(request, { headers })
  }
  return app.fetch(request, env, ctx)
}
```

Then configure `oidc()`. The JWKS endpoint for Cloudflare Access is not the standard
`/.well-known/jwks.json` path, so `jwksUri` is required:

```ts
admin: oidc({
  issuer: 'https://your-team.cloudflareaccess.com',
  audience: 'your-application-aud-tag',
  jwksUri: 'https://your-team.cloudflareaccess.com/cdn-cgi/access/certs',
  groupsClaim: 'groups',
  allowedGroups: ['flaghoist-admins'],
})
```

**Where to find the values:**

- **Team name** -- Cloudflare Zero Trust Dashboard > Settings > Custom Pages > your team domain
  (e.g. `your-team.cloudflareaccess.com`).
- **Application AUD tag** -- Zero Trust > Access > Applications > [your app] > Overview >
  **Application Audience (AUD) Tag**.
- **Group names** -- Zero Trust > My Team > Groups > [group name]. Use the group name as typed.
