# @flaghoist/adapter-cloudflare-kv

Store Flaghoist flags in Cloudflare Workers KV. This is the default storage for a Flaghoist deploy,
and the one the CLI picks unless you tell it otherwise.

```bash
npm install @flaghoist/adapter-cloudflare-kv
```

```ts
import { cloudflareKV } from '@flaghoist/adapter-cloudflare-kv'
import { createFlagServer } from '@flaghoist/server'

export default createFlagServer((env) => ({
  storage: cloudflareKV(env.FLAGS),
  auth: {/* ... */},
}))
```

`FLAGS` is a KV namespace binding in your `wrangler.toml`. If you are using the CLI, `flaghoist
deploy` creates the namespace and fills in its id for you. By hand it is:

```bash
npx wrangler kv namespace create FLAGS
```

Worth knowing: KV is eventually consistent. A flag you just changed can take a few seconds to reach
every edge location, which is fine for flags and would not be fine for a bank balance.

Storage is an interface, so moving to Redis or Postgres later is a one line change in your server
config.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
