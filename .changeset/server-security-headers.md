---
'@flaghoist/server': patch
---

Set baseline security headers on every response. The admin dashboard is now served with
`X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`, so it can no longer be
embedded in a frame and clickjacked, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy:
no-referrer` and a restrictive `Permissions-Policy`. These are additive and do not change the API
behaviour; the only visible effect is that the dashboard cannot be framed, which an admin tool should
not be.
