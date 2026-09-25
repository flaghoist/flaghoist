---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
'@flaghoist/core': minor
'flaghoist': minor
---

Add two-factor sign-in for password accounts. Members set up codes from an authenticator app on
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
