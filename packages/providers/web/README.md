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

Because it is a standard OFREP provider, nothing here is Flaghoist specific on the wire. If you
later move to another OFREP backend, your app code does not change.

Use the read only API key. Anything you put here is visible to anyone who opens devtools.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
