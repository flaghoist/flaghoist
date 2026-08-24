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

## Sharing a namespace

By default Flaghoist writes each flag under its own key, so a flag called `checkout` is stored as
`checkout`. That keeps the namespace readable when you browse it in the Cloudflare dashboard.

If the namespace holds anything besides Flaghoist's flags, give it a prefix:

```ts
cloudflareKV(env.FLAGS, { prefix: 'flag:' })
```

Without one, `list()` reads every key in the namespace. Values that are not flags are skipped rather
than showing up as broken rows, so nothing breaks, but you pay a read for each one.

Changing the prefix on a running deployment hides the flags written under the old one. They are
still in KV, the adapter is just no longer looking there.

Worth knowing: KV is eventually consistent. A flag you just changed can take a few seconds to reach
every edge location, which is fine for flags and would not be fine for a bank balance.

Storage is an interface, so moving to Redis or Postgres later is a one line change in your server
config.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
