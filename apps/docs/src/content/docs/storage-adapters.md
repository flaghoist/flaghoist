---
title: Storage adapters
description: Use Cloudflare KV, Redis, Postgres, or SQLite, or write your own in four methods.
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

Webhook endpoints live in the same namespace, under a separate `webhook:` prefix by default (`{
webhookPrefix: '...' }` to change it).

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

Webhook endpoints live in their own hash, `flaghoist:webhooks` by default (`{ webhookHashKey: '...'
}` to change it).

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

Webhook endpoints live in a second table, `flaghoist_webhooks` by default; `initPostgres` creates it
alongside the flags table. Pass a second argument (or `webhookTable` to the adapter) to rename it:

```ts
await initPostgres(pool, 'flags_staging', 'webhooks_staging')
postgresAdapter(pool, { table: 'flags_staging', webhookTable: 'webhooks_staging' })
```

## SQLite

Stores flags as JSON text in a single table. The best fit for a single-server VPS or local
development where you do not want to run a separate database process. Uses the synchronous
`better-sqlite3` API under the hood; all adapter methods still return Promises.

```bash
npm install @flaghoist/adapter-sqlite better-sqlite3
```

```ts
import { initSqlite, sqliteAdapter } from '@flaghoist/adapter-sqlite'
import Database from 'better-sqlite3'

const db = new Database(process.env.DATABASE_PATH ?? 'flags.db')
initSqlite(db) // CREATE TABLE IF NOT EXISTS flaghoist_flags (...)

createFlagServer({ storage: sqliteAdapter(db), auth: {/* ... */} })
```

The default table is `flaghoist_flags`. Pass `table` to use another name, and give the same name
to `initSqlite`:

```ts
await initSqlite(db, 'flags_staging')
sqliteAdapter(db, { table: 'flags_staging' })
```

Webhook endpoints live in a second table, `flaghoist_webhooks` by default; `initSqlite` creates it
alongside the flags table. Pass a second argument (or `webhookTable` to the adapter) to rename it:

```ts
await initSqlite(db, 'flags_staging', 'webhooks_staging')
sqliteAdapter(db, { table: 'flags_staging', webhookTable: 'webhooks_staging' })
```

SQLite works in any Node or container deployment. It does not work on Cloudflare Workers (no
filesystem access); use Cloudflare KV or Redis there.

## Scoping to an environment

There are two ways to keep `production` and `staging` apart. Which one fits depends on how much
isolation you want.

### Built-in environments (one server, one backend)

Pass `environments` to `createFlagServer` and every adapter above already knows what to do — no
separate config, no second table to think about. The same key can be on in staging and off in
production, sharing one storage instance:

```ts
createFlagServer({
  storage: postgresAdapter(pool),
  environments: ['production', 'staging', 'development'],
  auth: { admin: bearerToken(env.ADMIN_TOKEN), read: apiKeys({/* one key per env */}) },
})
```

Under the hood, the default environment's flags use the bare key you'd expect (`checkout`), and
every other environment's flags are stored under `{env}:{key}` (`staging:checkout`) with an
`environment` field on the stored JSON so `list()` can tell them apart. This is why turning
environments on for the first time needs no migration: existing flags are already the default
environment. See [Environments in the API reference](/api-reference/#environments) for the full
picture, including per-environment read keys.

This is the right default for most self-hosted setups: one deploy, one database to operate, and
environments are just a header away.

### Separate deployments (one server + backend per environment)

For harder isolation — different databases, independent scaling, a compromised staging credential
that can't even see production's storage — run one server per environment instead, each pointed at
its own adapter instance. Each adapter takes one code option that decides where its flags live:

| Adapter       | Option    | Default           |
| ------------- | --------- | ----------------- |
| Cloudflare KV | `prefix`  | `''`              |
| Redis         | `hashKey` | `flaghoist:flags` |
| Postgres      | `table`   | `flaghoist_flags` |
| SQLite        | `table`   | `flaghoist_flags` |

Wire it from an env var in your own entry file if you want, for example a `FLAGS_TABLE` you define:

```ts
const table = process.env.FLAGS_TABLE ?? 'flaghoist_flags'
await initPostgres(pool, table)
createFlagServer({ storage: postgresAdapter(pool, { table }), auth: {/* … */} })
```

There is nothing to rename and no migration step. The option is read at startup, and `initPostgres`
creates the table if it does not exist yet. This approach predates built-in environments and still
works exactly as described; it composes with a completely different Postgres instance, or a
different Cloudflare account, per environment in a way the shared-backend option above does not.

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

Webhook endpoints and audit entries are also kept in memory, with the same lifetime as the flags.

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

### Optional: persisting audit history and webhooks

Two more groups of methods are optional on `StorageAdapter`: `appendAudit`/`listAudit`, and
`putWebhook`/`getWebhook`/`deleteWebhook`/`listWebhooks`. Implement neither, one, or both — whatever
you skip falls back to an in-memory store instead (lost on restart, fine for local development, not
for production). All five shipped adapters implement both groups; see their source for the shape.

If you do implement the webhook methods, prove them with the matching, separately opt-in suite:

```ts
import { testWebhookStorage } from '@flaghoist/adapter-conformance'
testWebhookStorage('my-db', () => myAdapter(freshClient()))
```
