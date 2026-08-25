---
title: JavaScript and TypeScript
description: Read Flaghoist flags from a browser or Node app with the OpenFeature web or server SDK.
---

There are two SDKs depending on where your code runs: the **web** SDK for browsers and the **server**
SDK for Node, Bun and Deno. Flaghoist ships thin provider wrappers (`@flaghoist/provider-web`,
`@flaghoist/provider-node`, and `@flaghoist/vue`) that pre-attach your read key, but the official
OpenFeature OFREP providers work directly too.

## Browser

```bash
npm install @openfeature/web-sdk @flaghoist/provider-web
```

```ts
import { OpenFeature } from '@openfeature/web-sdk'
import { FlaghoistWebProvider } from '@flaghoist/provider-web'

await OpenFeature.setContext({ targetingKey: user.id, plan: user.plan })
await OpenFeature.setProviderAndWait(
  new FlaghoistWebProvider({
    url: 'https://team-flags.you.workers.dev',
    apiKey: import.meta.env.VITE_FLAGS_KEY,
  }),
)

const client = OpenFeature.getClient()
const newCheckout = client.getBooleanValue('new-checkout', false)
```

Using Vue? `@flaghoist/vue` adds a reactive `useFeatureFlag()` composable over this.

## Node, Bun, Deno

```bash
npm install @openfeature/server-sdk @flaghoist/provider-node
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

On the server, pass the evaluation context per request rather than setting it globally. A shared
global context means every request is evaluated as the same user.

## Without the Flaghoist wrapper

The wrappers only attach the `x-api-key` header. You can use the official provider directly:

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider'

new OFREPWebProvider({
  baseUrl: 'https://team-flags.you.workers.dev',
  headers: [['x-api-key', apiKey]],
})
```
