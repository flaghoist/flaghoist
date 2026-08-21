# @flaghoist/adapter-postgres

Store Flaghoist flags in Postgres, in a single jsonb table. Works with any node-postgres compatible
client, so a `Pool` from `pg` is the usual starting point.

```bash
npm install @flaghoist/adapter-postgres pg
```

```ts
import { postgresAdapter, postgresSchema } from '@flaghoist/adapter-postgres'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

createFlagServer({
  storage: postgresAdapter(pool),
  auth: {/* ... */},
})
```

Create the table first. `postgresSchema()` gives you the SQL rather than running migrations behind
your back:

```ts
await pool.query(postgresSchema())
```

Pass a name if you want it somewhere other than `flaghoist_flags`.

This is the one to choose when your flags should live in a database you already back up, or when the
database sits inside a VPC that a Worker cannot reach anyway. Note that it wants a real TCP
connection, so it suits Node, Bun or a container rather than an edge runtime.

Validated by the same conformance suite as the other adapters.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
