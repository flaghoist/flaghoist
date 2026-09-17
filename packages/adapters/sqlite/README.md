# @flaghoist/adapter-sqlite

Store Flaghoist flags in SQLite, in a single table. Works with any better-sqlite3-compatible
driver, so a `Database` instance from `better-sqlite3` is the usual starting point.

```bash
npm install @flaghoist/adapter-sqlite better-sqlite3
```

```ts
import { sqliteAdapter, initSqlite } from '@flaghoist/adapter-sqlite'
import Database from 'better-sqlite3'

const db = new Database('flags.db')
initSqlite(db) // creates the table if it does not exist

createFlagServer({
  storage: sqliteAdapter(db),
  auth: {/* ... */},
})
```

Create the table first. `sqliteSchema()` gives you the SQL rather than running migrations behind
your back:

```ts
db.exec(sqliteSchema())
```

Pass a name if you want it somewhere other than `flaghoist_flags`.

This is the one to choose for local development, a single-server VPS where you do not want to run
a separate database process, or any deploy where SQLite's simplicity and zero-dependency setup is
the right fit. The adapter stores flags as JSON text and prepares all statements at creation time,
so reads are fast and the full flag shape round-trips without loss.

Validated by the same conformance suite as the other adapters.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
