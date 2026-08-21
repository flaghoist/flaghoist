# @flaghoist/provider-node

An OpenFeature provider for Node and other server runtimes, pointed at a Flaghoist server.

It is the official OFREP provider with your server URL and read API key already attached.

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

Because it speaks OFREP, this is a standard provider rather than a Flaghoist specific client. The
same is true from any language with an OFREP provider, which is why there is no Go or Python package
here to install.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
