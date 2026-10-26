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
    url: 'https://flags.example.com',
    apiKey: import.meta.env.VITE_FLAGS_KEY,
  }),
)

const client = OpenFeature.getClient()
const newCheckout = client.getBooleanValue('new-checkout', false)
```

Using Vue? `@flaghoist/vue` adds a reactive `useFeatureFlag()` composable over this.

The browser provider fetches every flag in one request, then answers each check from memory, so
`getBooleanValue` is synchronous and costs nothing to call as often as you like.

### Keeping the browser up to date

By default it re-fetches when the evaluation context changes and when the tab becomes visible again.
It does not poll, so a page left open side by side with the dashboard will not change until one of
those happens. Set `pollInterval` (milliseconds) for live updates:

```ts
new FlaghoistWebProvider({
  url: 'https://flags.example.com',
  apiKey: import.meta.env.VITE_FLAGS_KEY,
  pollInterval: 30_000,
})
```

The server caches flag definitions for [`cacheTtlSeconds`](/storage-adapters/#how-soon-a-change-shows-up)
(30 by default), so polling much faster than that mostly fetches the same answer.
`changeDetection: 'none'` turns all background refreshes off, and `disableVisibilityRefresh: true`
stops the refresh on tab focus.

Code that already ran will not re-run by itself when a poll finds a change. Listen for it and
re-render, or use the React hooks or `@flaghoist/vue`, which do this for you:

```ts
import { ProviderEvents } from '@openfeature/web-sdk'

client.addHandler(ProviderEvents.ConfigurationChanged, ({ flagsChanged }) => {
  if (flagsChanged?.includes('new-checkout')) render()
})
```

Every option of the official
[OFREP web provider](https://www.npmjs.com/package/@openfeature/ofrep-web-provider) is accepted, with
its defaults: `cacheMode` and `cacheTTL` (see [During an outage](#during-an-outage)), `timeoutMs`,
`headersFactory`, `query`, `fetchImplementation`, `cacheKeyGenerator` and the SSE settings.

## React

React reads flags through the official [`@openfeature/react-sdk`](https://www.npmjs.com/package/@openfeature/react-sdk), so there is no Flaghoist-specific React package to install. `@flaghoist/provider-web` is the only Flaghoist piece; everything your components touch is standard OpenFeature.

```bash
npm install @openfeature/react-sdk @openfeature/web-sdk @flaghoist/provider-web
```

Register the provider once, wrap your tree in `OpenFeatureProvider`, then read flags with the hooks:

```tsx
// main.tsx
import { FlaghoistWebProvider } from '@flaghoist/provider-web'
import { OpenFeature, OpenFeatureProvider } from '@openfeature/react-sdk'
import { createRoot } from 'react-dom/client'
import App from './App'

// The targetingKey drives sticky rollouts and targeting rules. Set it before you register.
await OpenFeature.setContext({ targetingKey: user.id, plan: user.plan })
await OpenFeature.setProviderAndWait(
  new FlaghoistWebProvider({
    url: 'https://flags.example.com',
    apiKey: import.meta.env.VITE_FLAGS_KEY,
  }),
)

createRoot(document.getElementById('root')!).render(
  <OpenFeatureProvider>
    <App />
  </OpenFeatureProvider>,
)
```

```tsx
// App.tsx
import { useBooleanFlagValue } from '@openfeature/react-sdk'

export default function App() {
  const newCheckout = useBooleanFlagValue('new-checkout', false)
  return newCheckout ? <NewCheckout /> : <LegacyCheckout />
}
```

The hooks re-render when the provider or the flags change. There is a runnable version in [`examples/react`](https://github.com/flaghoist/flaghoist/tree/main/examples/react).

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

### One request per context, not per check

The server provider fetches every flag for a context in one request to the OFREP bulk endpoint and
answers each check from that result. A handler that checks three flags makes one round trip, not
three, and `Promise.all` over several flags is one request too, because checks that arrive while a
request is in flight share it.

```ts
new FlaghoistProvider({
  url: process.env.FLAGS_URL,
  apiKey: process.env.FLAGS_READ_KEY,
  cacheTtlMs: 5_000, // how long one context's flags are reused. Default 5000
  maxCachedContexts: 1_000, // oldest context dropped first past this. Default 1000
  // bulk: false, // one request per check, like the plain OFREP provider
})
```

The cache adds up to `cacheTtlMs` before a toggle reaches this process, on top of the server's own
`cacheTtlSeconds`. A flag the server does not have returns `FLAG_NOT_FOUND` with your default. On a
`429` the provider stops calling the server until `Retry-After` has passed and returns defaults in the
meantime.

Each distinct context is still its own request, so a backend serving many different users makes
about one request per user per `cacheTtlMs`. If your server has rate limiting on, read
[rate limits and server-side readers](/self-hosting/#server-side-readers).

Every option of the official
[OFREP server provider](https://www.npmjs.com/package/@openfeature/ofrep-provider) is accepted too,
with its defaults: `timeoutMs`, `headersFactory` (headers computed per request, for keys that
rotate), `query` and `fetchImplementation`. The option names match the browser provider.

## During an outage

When the Flaghoist server cannot be reached, the two providers behave differently by default:

| Provider                 | Server unreachable or erroring                               |
| ------------------------ | ------------------------------------------------------------ |
| Browser (`provider-web`) | Last known values, saved in `localStorage` for up to 30 days |
| Server (`provider-node`) | The default you passed to each check                         |

Both are reasonable on their own. Together, a page can show a feature as on while your API, asking
the same question, gets the default and treats it as off. The 30-day lifetime also means a browser
that has not reached the server in weeks can show values that were changed long ago.

To make them agree, choose the browser's `cacheMode`:

| `cacheMode`                     | On startup                  | Server unreachable |
| ------------------------------- | --------------------------- | ------------------ |
| `'local-cache-first'` (default) | Saved flags, refresh behind | Last known values  |
| `'network-first'`               | Waits for the server        | Last known values  |
| `'disabled'`                    | Waits for the server        | Your code defaults |

`'disabled'` matches the server provider exactly. If you keep saved values, a shorter `cacheTTL`
(seconds) limits how stale they can get. Either way, a rejected key (`401`, `403`) or a bad request
(`400`) is never hidden behind saved values.

The safest design does not depend on the two agreeing: decide anything that matters, a price, a
permission, a kill switch, on the server, and treat what the browser shows as presentation.

Neither provider throws when it falls back. To see that it did, read the details instead of the
value:

```ts
// Server shown; in the browser it is synchronous and takes no context.
const details = await client.getBooleanDetails('new-checkout', false, ctx)
if (details.errorCode)
  log.warn('flag fell back to default', details.errorCode, details.errorMessage)
```

An OpenFeature [hook](https://openfeature.dev/docs/reference/concepts/hooks) with an `error` stage
does the same for every flag in one place.

## Without the Flaghoist wrapper

The browser wrapper attaches the `x-api-key` header and passes every other option through. The server
wrapper does the same and adds the bulk fetch described above. You can use the official providers
directly:

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider'

new OFREPWebProvider({
  baseUrl: 'https://flags.example.com',
  headers: [['x-api-key', apiKey]],
})
```
