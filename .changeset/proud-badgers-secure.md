---
'@flaghoist/core': patch
'@flaghoist/server': patch
---

Three hardening fixes from a security audit.

The admin dashboard now keeps the session token in `sessionStorage` rather than `localStorage`, so
the token dies with the browser tab instead of sitting on disk. It is full admin authority with no
expiry, and `localStorage` is readable by any script on the origin, so a smaller window is the safer
default. The sign-in URL field already defaults to the current origin, so nothing is lost by not
persisting it.

A flag description is now bounded to 2048 characters. It was unbounded within the 64KB request body
limit, so an authenticated writer could bloat every `list()` and every dashboard load, since the
list returns full flag bodies with no pagination. `parseFlag` rejects a flag over the cap and the
admin write path returns a specific error.

`apiKey` and `bearerToken` warn once, to the server log, when the shared secret is under 16
characters. Flaghoist does not rate limit authentication, so a short token is guessable; the warning
is guidance rather than a wall, since rejecting a short secret outright could lock an operator out of
a running service. The secret is never retained: the dedupe key is a short hash of it.
