import {
  assertRecordAddress,
  parseFlag,
  type FeatureFlag,
  type RecordEntry,
  type StorageAdapter,
  type WebhookEndpoint,
} from '@flaghoist/core'

/**
 * The minimal structural subset of a better-sqlite3 `Statement` this adapter uses. Any library
 * whose statements satisfy these three methods will work without modification.
 */
export interface SqliteStatement {
  get(...args: unknown[]): unknown
  run(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
}

/**
 * The minimal structural subset of a better-sqlite3 `Database` this adapter uses. A Database
 * instance from better-sqlite3 satisfies it directly -- pass yours in.
 */
export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement
  exec(sql: string): void
}

export interface SqliteAdapterOptions {
  /** Table name. Must be a plain SQL identifier. Default: `"flaghoist_flags"`. */
  table?: string

  /** Webhook table name. Must be a plain SQL identifier. Default: `"flaghoist_webhooks"`. */
  webhookTable?: string

  /** Record-store table name. Must be a plain SQL identifier. Default: `"flaghoist_records"`. */
  recordTable?: string
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(
      `Invalid SQLite table name ${JSON.stringify(name)}: must match ${IDENTIFIER.source}.`,
    )
  }
  return name
}

/** SQL that creates the flags table. Run once (or via `initSqlite`). */
export function sqliteSchema(table = 'flaghoist_flags'): string {
  return `CREATE TABLE IF NOT EXISTS ${assertIdentifier(table)} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
}

/** SQL that creates the webhooks table. */
export function sqliteWebhookSchema(table = 'flaghoist_webhooks'): string {
  return `CREATE TABLE IF NOT EXISTS ${assertIdentifier(table)} (id TEXT PRIMARY KEY, value TEXT NOT NULL)`
}

/** SQL that creates the record-store table. */
export function sqliteRecordSchema(table = 'flaghoist_records'): string {
  return `CREATE TABLE IF NOT EXISTS ${assertIdentifier(table)} (collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (collection, id))`
}

/** Create the flags, webhooks and record-store tables if they do not already exist. */
export function initSqlite(
  db: SqliteDatabase,
  table = 'flaghoist_flags',
  webhookTable = 'flaghoist_webhooks',
  recordTable = 'flaghoist_records',
): void {
  db.exec(sqliteSchema(table))
  db.exec(sqliteWebhookSchema(webhookTable))
  db.exec(sqliteRecordSchema(recordTable))
}

function toFlag(raw: unknown): FeatureFlag | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return parseFlag(JSON.parse(raw))
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return parseFlag(raw)
  return null
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/**
 * Prepare a statement on first use rather than at construction. better-sqlite3 validates the table
 * when a statement is prepared, so preparing eagerly would make a database that only has the flags
 * table (set up before webhooks or records existed) fail to start at all. The optional features
 * now fail only when used, with a pointer to the fix.
 */
function lazyStatement(db: SqliteDatabase, sql: string): () => SqliteStatement {
  let stmt: SqliteStatement | undefined
  return () => {
    if (!stmt) {
      try {
        stmt = db.prepare(sql)
      } catch (err) {
        if (err instanceof Error && /no such table/i.test(err.message)) {
          throw new Error(`${err.message}. Create it with initSqlite(db).`)
        }
        throw err
      }
    }
    return stmt
  }
}

/**
 * A StorageAdapter backed by SQLite. Flags are stored as JSON text in a single table keyed by
 * flag key. All queries use prepared statements; every read is re-validated through `parseFlag`
 * so corrupt rows degrade to "flag ignored". Run `initSqlite` once to create the tables.
 *
 * Uses the synchronous better-sqlite3 API under the hood; all methods still return Promises
 * to satisfy the StorageAdapter interface.
 */
export function sqliteAdapter(
  db: SqliteDatabase,
  options: SqliteAdapterOptions = {},
): StorageAdapter {
  const table = assertIdentifier(options.table ?? 'flaghoist_flags')
  const whTable = assertIdentifier(options.webhookTable ?? 'flaghoist_webhooks')
  const recTable = assertIdentifier(options.recordTable ?? 'flaghoist_records')
  const stmtGet = db.prepare(`SELECT value FROM ${table} WHERE key = ?`)
  const stmtPut = db.prepare(`INSERT OR REPLACE INTO ${table} (key, value) VALUES (?, ?)`)
  const stmtDelete = db.prepare(`DELETE FROM ${table} WHERE key = ?`)
  const stmtList = db.prepare(`SELECT value FROM ${table}`)

  const whGet = lazyStatement(db, `SELECT value FROM ${whTable} WHERE id = ?`)
  const whPut = lazyStatement(db, `INSERT OR REPLACE INTO ${whTable} (id, value) VALUES (?, ?)`)
  const whDelete = lazyStatement(db, `DELETE FROM ${whTable} WHERE id = ?`)
  const whList = lazyStatement(db, `SELECT value FROM ${whTable}`)

  const recGet = lazyStatement(db, `SELECT value FROM ${recTable} WHERE collection = ? AND id = ?`)
  const recPut = lazyStatement(
    db,
    `INSERT OR REPLACE INTO ${recTable} (collection, id, value) VALUES (?, ?, ?)`,
  )
  const recDelete = lazyStatement(db, `DELETE FROM ${recTable} WHERE collection = ? AND id = ?`)
  const recList = lazyStatement(db, `SELECT id, value FROM ${recTable} WHERE collection = ?`)

  return {
    async get(key) {
      const row = stmtGet.get(key) as { value: string } | undefined
      return row ? toFlag(row.value) : null
    },
    async put(key, flag) {
      stmtPut.run(key, JSON.stringify(flag))
    },
    async delete(key) {
      stmtDelete.run(key)
    },
    async list() {
      const rows = stmtList.all() as { value: string }[]
      const flags: FeatureFlag[] = []
      for (const row of rows) {
        const flag = toFlag(row.value)
        if (flag) flags.push(flag)
      }
      return flags
    },

    async putWebhook(id, webhook) {
      whPut().run(id, JSON.stringify(webhook))
    },
    async getWebhook(id) {
      const row = whGet().get(id) as { value: string } | undefined
      return row ? (parseJson(row.value) as WebhookEndpoint | null) : null
    },
    async deleteWebhook(id) {
      whDelete().run(id)
    },
    async listWebhooks() {
      const rows = whList().all() as { value: string }[]
      const hooks: WebhookEndpoint[] = []
      for (const row of rows) {
        const hook = parseJson(row.value) as WebhookEndpoint | null
        if (hook) hooks.push(hook)
      }
      return hooks
    },

    async getRecord(collection, id) {
      assertRecordAddress(collection, id)
      const row = recGet().get(collection, id) as { value: string } | undefined
      return row ? parseJson(row.value) : null
    },
    async putRecord(collection, id, value) {
      assertRecordAddress(collection, id)
      recPut().run(collection, id, JSON.stringify(value))
    },
    async deleteRecord(collection, id) {
      assertRecordAddress(collection, id)
      recDelete().run(collection, id)
    },
    async listRecords(collection) {
      assertRecordAddress(collection)
      const rows = recList().all(collection) as { id: string; value: string }[]
      const entries: RecordEntry[] = []
      for (const row of rows) {
        const value = parseJson(row.value)
        if (value !== null) entries.push({ id: row.id, value })
      }
      return entries
    },
  }
}
