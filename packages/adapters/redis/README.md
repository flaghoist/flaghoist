# @flaghoist/adapter-redis

Store Flaghoist flags in Redis. Works with ioredis on Node and with Upstash on the edge, because it
only needs a client that can get, set, delete and scan.

```bash
npm install @flaghoist/adapter-redis
```

On Node with ioredis:

```ts
import { redisAdapter } from '@flaghoist/adapter-redis'
import { Redis } from 'ioredis'

createFlagServer({
  storage: redisAdapter(new Redis(process.env.REDIS_URL)),
  auth: {/* ... */},
})
```

On Cloudflare Workers with Upstash, where a TCP connection is not an option:

```ts
import { Redis } from '@upstash/redis/cloudflare'

createFlagServer((env) => ({
  storage: redisAdapter(Redis.fromEnv(env)),
  auth: {/* ... */},
}))
```

Pick this over Cloudflare KV when you want changes to be visible immediately everywhere, rather than
a few seconds later. Pick KV when you would rather not run anything.

Validated by the same conformance suite as the other adapters.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
