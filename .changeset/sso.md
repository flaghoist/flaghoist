---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
---

Add single sign-on to the dashboard. With `users.sso` set to an OpenID Connect provider (Okta,
Microsoft Entra, Google, Auth0, Keycloak and others), the sign-in screen offers "Continue with ..."
and the server runs the authorization code flow with PKCE, checking the ID token's signature,
issuer, audience, expiry and nonce. Accounts are created at first sign-in for allowed email
domains with a verified email, linked by email to an existing account, or joined through an open
invite. `roleMapping` lets the provider's groups decide roles at every sign-in (they then cannot be
changed on the Members page); `defaultRole` covers people in no mapped group, who are otherwise
refused. `passwordSignIn: false` makes sign-in SSO only, with the admin token kept as the way back
in. No cookies are used: the sign-in state is encrypted into the `state` parameter, only the tab
that started a sign-in can finish it, and the session token never appears in a URL.
