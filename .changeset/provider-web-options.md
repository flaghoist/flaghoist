---
'@flaghoist/provider-web': minor
---

Pass every option of the official OFREP web provider through, instead of dropping all but the URL
and headers.

`FlaghoistWebProvider` used to accept only `url`, `apiKey` and `headers`, so `pollInterval`,
`changeDetection`, `cacheMode`, `cacheTTL`, `timeoutMs` and the rest were silently ignored. The
browser could only refresh flags on a context change or when the tab became visible again, and there
was no way to choose what users see during an outage. All of them now reach the upstream provider
with its own defaults, so behaviour without them is unchanged. The constructor also takes the
upstream provider's optional `logger`.

The README now explains the two choices that matter: `pollInterval` for live updates, and
`cacheMode` for whether an outage shows the last known values (the default) or your code defaults.
