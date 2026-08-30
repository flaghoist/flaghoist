---
title: Storage adapters
description: Use Cloudflare KV, Redis, or Postgres, or write your own in four methods.
---

Storage is the "bring your own DB" seam. Every adapter implements the same four-method interface,
and every adapter, shipped or yours, must pass the shared conformance suite.

```ts
interface StorageAdapter {
  get(key: string): Promise<FeatureFlag | null>
  put(key: string, flag: FeatureFlag): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<FeatureFlag[]>
}
```

## Cloudflare KV (default)

```ts
import { cloudflareKV } from '@flaghoist/adapter-cloudflare-kv'

createFlagServer((env) => ({ storage: cloudflareKV(env.FLAGS), auth: {/* … */} }))
```

Each flag is stored under its own key, so a flag called `checkout` is the key `checkout`. If the KV
namespace holds anything besides Flaghoist's flags, namespace them with a prefix:

```ts
cloudflareKV(env.FLAGS, { prefix: 'flag:' })
```

Without a prefix, `list()` reads every key in the namespace. Values that are not flags are skipped
rather than appearing as broken rows, so nothing breaks, but you pay a read for each one. Changing
the prefix later hides the flags written under the old one: they are still in KV, the adapter is
just no longer looking there.

## Redis

Works with `ioredis` (Node) and Upstash (edge). All flags live in one hash, so `list()` is a single
`hgetall`.

```ts
import { redisAdapter } from '@flaghoist/adapter-redis'
import Redis from 'ioredis'

createFlagServer({ storage: redisAdapter(new Redis(process.env.REDIS_URL)), auth: {/* … */} })
```

All flags share one hash key, `flaghoist:flags` by default. Point a second instance at a different
key to keep it separate from anything else in the same Redis:

```ts
redisAdapter(new Redis(process.env.REDIS_URL), { hashKey: 'flags:staging' })
```

## Postgres

Stores flags in a `jsonb` table via any `node-postgres` client. Run the schema once:

```ts
import { initPostgres, postgresAdapter } from '@flaghoist/adapter-postgres'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
await initPostgres(pool) // CREATE TABLE IF NOT EXISTS flaghoist_flags (...)

createFlagServer({ storage: postgresAdapter(pool), auth: {/* … */} })
```

The default table is `flaghoist_flags`. Pass `table` to use another, and give the same name to
`initPostgres` so the schema lands in the right place. The name is validated as a plain SQL
identifier, so it is injection-safe:

```ts
await initPostgres(pool, 'flags_staging')
postgresAdapter(pool, { table: 'flags_staging' })
```

## Scoping to an environment

Flaghoist has no ORM-style naming strategy, and no adapter reads a table name from the environment on
its own. Each adapter instead takes one code option that decides where its flags live:

| Adapter       | Option    | Default           |
| ------------- | --------- | ----------------- |
| Cloudflare KV | `prefix`  | `''`              |
| Redis         | `hashKey` | `flaghoist:flags` |
| Postgres      | `table`   | `flaghoist_flags` |

To keep environments apart, run one server per environment and point each at a different value. Wire
it from an env var in your own entry file if you want, for example a `FLAGS_TABLE` you define:

```ts
const table = process.env.FLAGS_TABLE ?? 'flaghoist_flags'
await initPostgres(pool, table)
createFlagServer({ storage: postgresAdapter(pool, { table }), auth: {/* … */} })
```

There is nothing to rename and no migration step. The option is read at startup, and `initPostgres`
creates the table if it does not exist yet.

## Memory

Backed by a `Map`, with no persistence. Flags are lost on restart, so this is for local
development, tests, and `npx flaghoist init --storage memory` when you just want something running
immediately with nothing to provision.

```ts
import { memoryAdapter } from '@flaghoist/adapter-memory'

createFlagServer({ storage: memoryAdapter(), auth: {/* … */} })
```

Seed it with flags at startup by passing them to the factory. `createFlag` fills in the metadata a
hand-built object would otherwise be missing:

```ts
import { createFlag } from '@flaghoist/core'

memoryAdapter([createFlag({ key: 'new-checkout', enabled: true, rollout: { percentage: 25 } })])
```

## Writing your own

Implement the four methods. A key maps to one flag's JSON, so any store fits. Re-validate reads
through `parseFlag` so corrupt data degrades to "flag ignored" rather than crashing evaluation:

```ts
import { parseFlag, type StorageAdapter } from '@flaghoist/core'

export function myAdapter(client: MyClient): StorageAdapter {
  return {
    async get(key) {
      const raw = await client.read(key)
      return raw ? parseFlag(JSON.parse(raw)) : null
    },
    async put(key, flag) {
      await client.write(key, JSON.stringify(flag))
    },
    async delete(key) {
      await client.remove(key)
    },
    async list() {
      return (await client.all()).map((r) => parseFlag(JSON.parse(r))).filter(Boolean)
    },
  }
}
```

Prove it against the conformance suite:

```ts
import { testStorageAdapter } from '@flaghoist/adapter-conformance'
testStorageAdapter('my-db', () => myAdapter(freshClient()))
```

For SQL adapters, use parameterized queries everywhere, and validate any table/identifier names:
they cannot be parameterized and are the one place injection could enter.
