---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
'@flaghoist/core': minor
'@flaghoist/adapter-memory': patch
---

Add user accounts. Set `users: { pepper }` and people sign in to the dashboard with an email and
password, and every change is recorded against their email. Passwords are hashed in the browser
with PBKDF2 and never reach the server, which stores only a keyed HMAC, so sign-in fits the
Cloudflare Workers free plan. Sessions are revocable, end after 30 idle minutes or 12 hours, and
are listed on a new Account page along with a password change form. Failed sign-ins are throttled
per email and per IP. The admin token stays as a break-glass Owner credential, creates the first
account, and is recorded as `owner (break-glass)`. The server refuses to start with `users` set on
a storage adapter without the record store.

Sign-ins, password changes and webhook changes go to a new security log, read with
`GET /api/v1/audit?category=security` (admin and owner) and shown under a Security tab in the
dashboard. `AuditEntry.flagKey` is now optional, since security entries name a `target` instead;
flag entries always carry it, and the default audit list still returns flag changes only.
`@flaghoist/admin-client` adds `createAuthClient`, `deriveClientKey`, and `me`, `logout`,
`createOwner`, `changePassword` and session methods on the admin client.
