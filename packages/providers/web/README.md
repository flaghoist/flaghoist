# @flaghoist/provider-web

An OpenFeature provider for browser apps, pointed at a Flaghoist server.

It is the official OFREP web provider with the wiring already done: your server URL, and the read
API key attached as the `x-api-key` header on every request.

```bash
npm install @flaghoist/provider-web @openfeature/web-sdk
```

```ts
import { OpenFeature } from '@openfeature/web-sdk'
import { FlaghoistWebProvider } from '@flaghoist/provider-web'

await OpenFeature.setProviderAndWait(
  new FlaghoistWebProvider({
    url: 'https://team-flags.example.workers.dev',
    apiKey: import.meta.env.VITE_FLAGS_KEY,
  }),
)

const client = OpenFeature.getClient()
client.getBooleanValue('new-checkout', false)
```

Using Vue? `@flaghoist/vue` wraps this with a `useFeatureFlag()` composable.

## Options

Every option of the official
[OFREP web provider](https://www.npmjs.com/package/@openfeature/ofrep-web-provider) passes through
unchanged, with the same defaults. Two are worth deciding on deliberately.

**Staying up to date.** The provider fetches every flag in one request when it starts, when the
evaluation context changes, and when the tab becomes visible again. It does not poll by default, so
a user who stays on one page will not see a toggle until one of those happens. Set `pollInterval`
for live updates:

```ts
new FlaghoistWebProvider({
  url: 'https://team-flags.example.workers.dev',
  apiKey: import.meta.env.VITE_FLAGS_KEY,
  pollInterval: 30_000, // re-fetch every 30 seconds. Default 0 (off)
})
```

The server caches flag definitions for `cacheTtlSeconds` (30 by default), so polling much faster
than that mostly fetches the same answer. `changeDetection: 'none'` turns all background refreshes
off, and `disableVisibilityRefresh: true` stops the refresh on tab focus.

**What an outage looks like.** By default (`cacheMode: 'local-cache-first'`) the provider saves the
last flags it saw in `localStorage` for up to 30 days (`cacheTTL`, in seconds). It starts from them
instantly, and if the server is unreachable, users keep the last known values. That differs from
`@flaghoist/provider-node`, which returns the defaults in your code when the server is down. Choose
what fits:

| `cacheMode`                     | On startup                  | Server unreachable |
| ------------------------------- | --------------------------- | ------------------ |
| `'local-cache-first'` (default) | Saved flags, refresh behind | Last known values  |
| `'network-first'`               | Waits for the server        | Last known values  |
| `'disabled'`                    | Waits for the server        | Your code defaults |

A rejected key (401, 403) or bad request (400) is never hidden behind saved flags, in any mode.

`timeoutMs`, `headersFactory`, `query`, `fetchImplementation`, `cacheKeyGenerator` and the SSE
settings are also accepted; see the upstream README for each.

Because it is a standard OFREP provider, nothing here is Flaghoist specific on the wire. If you
later move to another OFREP backend, your app code does not change.

Use the read only API key. Anything you put here is visible to anyone who opens devtools.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
