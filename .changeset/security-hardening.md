---
'@flaghoist/server': minor
---

Tighten the server's Content-Security-Policy to a `default-src 'none'` baseline, and rate limit the
dashboard at `/admin` to 30 requests per minute per IP, independent of the configurable API rate
limiter. The dashboard now signs out after 30 minutes without activity.
