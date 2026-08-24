---
'@flaghoist/server': minor
---

Add opt-in rate limiting.

Flaghoist did not throttle anything, so authentication attempts, the evaluate path, and the
unauthenticated `/admin` payload could all be hit as fast as the network allowed. A `rateLimit` hook
in the server config turns limiting on, applied to every route except `/health` and run before
authentication so credential guessing is throttled too. A denied request returns `429` with a
`Retry-After` header, and the OFREP read path treats a `429` as an error and returns the caller's
default, so limiting it fails safe.

The bundled `memoryRateLimit` counts per client IP in memory: genuinely effective on a single Node
or container process, and per-isolate on Cloudflare Workers, where the platform's own Rate Limiting
rules are the real answer and this is a backstop. Bring your own limiter (a Redis counter, a
Cloudflare binding) by passing any object with a `check(key)` method, and override the bucket key
when you have a trustworthy client identifier.

Off by default: a limiter with the wrong bucket key is worse than none, and only the operator knows
how their deployment is fronted. Existing configs are unaffected.
