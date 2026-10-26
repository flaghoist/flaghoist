---
'@flaghoist/provider-node': minor
---

Fetch every flag for a context in one request, instead of one request per flag check.

A handler that checked three flags used to make three round trips to the server, each one counting
against the rate limit, so under load checks could quietly fall back to their defaults. The provider
now calls the OFREP bulk endpoint once per evaluation context and answers each check from that
result. Checks that arrive while the request is in flight share it, and the result is reused for 5
seconds per context.

New options: `cacheTtlMs` (default 5000), `maxCachedContexts` (default 1000), and `bulk: false` to
keep the old one-request-per-check behaviour. A flag missing from the server returns
`FLAG_NOT_FOUND` with your default, a failed request returns defaults without being cached, and a
`429` pauses requests until `Retry-After` has passed.
