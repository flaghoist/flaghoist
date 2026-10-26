# @flaghoist/provider-node

An OpenFeature provider for Node and other server runtimes, pointed at a Flaghoist server.

It is the official OFREP provider with your server URL and read API key already attached, plus one
change: it fetches every flag for a context in a single request, instead of one request per check.

```bash
npm install @flaghoist/provider-node @openfeature/server-sdk
```

```ts
import { OpenFeature } from '@openfeature/server-sdk'
import { FlaghoistProvider } from '@flaghoist/provider-node'

await OpenFeature.setProviderAndWait(
  new FlaghoistProvider({
    url: process.env.FLAGS_URL,
    apiKey: process.env.FLAGS_READ_KEY,
  }),
)

const client = OpenFeature.getClient()
const enabled = await client.getBooleanValue('new-checkout', false, {
  targetingKey: user.id,
  plan: user.plan,
})
```

Pass the evaluation context per request rather than setting it globally. Targeting rules and
rollouts are evaluated against whatever you send, so a shared context on a server means everyone
gets the same answer.

## One request per context, not per check

A request handler that checks three flags would otherwise make three round trips, and each one
counts against the server's rate limit. Here the first check for a context calls the OFREP bulk
endpoint once, and every other check for that context is answered from the result. Checks that
arrive while that request is still in flight share it, so `Promise.all` over several flags is one
request too.

The result is kept for 5 seconds per context, so a toggle can take that much longer to reach this
process, on top of the server's own `cacheTtlSeconds`. Tune it, or turn bulk off entirely:

```ts
new FlaghoistProvider({
  url: process.env.FLAGS_URL,
  apiKey: process.env.FLAGS_READ_KEY,
  cacheTtlMs: 1000, // how long a context's flags are reused. Default 5000
  maxCachedContexts: 1000, // oldest context dropped first past this. Default 1000
  // bulk: false, // one request per check, like the plain OFREP provider
})
```

A flag the server does not have comes back as `FLAG_NOT_FOUND` with your default. If the server
is unreachable or errors, every check gets its default and the failure is not cached, so the next
check tries again. On a `429` the provider stops calling the server until `Retry-After` has passed,
and returns defaults in the meantime.

Each distinct context is still its own request, so a busy server evaluating many different users
makes one request per user per `cacheTtlMs`. If that runs into a rate limit you set with
`rateLimit`, raise the limit for your server's address rather than dropping the cache.

Every option of the official
[OFREP server provider](https://www.npmjs.com/package/@openfeature/ofrep-provider) passes through
too, with the same defaults: `timeoutMs`, `headersFactory` (headers computed per request, for keys
that rotate), `query` and `fetchImplementation`. They apply to the bulk request and to
`bulk: false` alike, and match the option names in `@flaghoist/provider-web`.

Because it speaks OFREP, this is a standard provider rather than a Flaghoist specific client. The
same is true from any language with an OFREP provider, which is why there is no Go or Python package
here to install.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
