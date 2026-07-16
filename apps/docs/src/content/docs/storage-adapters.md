---
title: Storage adapters
description: Use Cloudflare KV, Redis, or Postgres — or write your own in four methods.
---

Storage is the "bring your own DB" seam. Every adapter implements the same four-method interface,
and every adapter — shipped or yours — must pass the shared conformance suite.

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

## Redis

Works with `ioredis` (Node) and Upstash (edge). All flags live in one hash, so `list()` is a single
`hgetall`.

```ts
import { redisAdapter } from '@flaghoist/adapter-redis'
import Redis from 'ioredis'

createFlagServer({ storage: redisAdapter(new Redis(process.env.REDIS_URL)), auth: {/* … */} })
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

For SQL adapters, use parameterized queries everywhere, and validate any table/identifier names —
they cannot be parameterized and are the one place injection could enter.
