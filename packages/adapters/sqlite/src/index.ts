import { parseFlag, type FeatureFlag, type StorageAdapter, type WebhookEndpoint } from '@flaghoist/core'

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

/** Create the flags and webhooks tables if they do not already exist. */
export function initSqlite(
  db: SqliteDatabase,
  table = 'flaghoist_flags',
  webhookTable = 'flaghoist_webhooks',
): void {
  db.exec(sqliteSchema(table))
  db.exec(sqliteWebhookSchema(webhookTable))
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

/**
 * A StorageAdapter backed by SQLite. Flags are stored as JSON text in a single table keyed by
 * flag key. All queries use prepared statements; every read is re-validated through `parseFlag`
 * so corrupt rows degrade to "flag ignored". Run `initSqlite` once to create the table.
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
  const stmtGet = db.prepare(`SELECT value FROM ${table} WHERE key = ?`)
  const stmtPut = db.prepare(`INSERT OR REPLACE INTO ${table} (key, value) VALUES (?, ?)`)
  const stmtDelete = db.prepare(`DELETE FROM ${table} WHERE key = ?`)
  const stmtList = db.prepare(`SELECT value FROM ${table}`)

  const whGet = db.prepare(`SELECT value FROM ${whTable} WHERE id = ?`)
  const whPut = db.prepare(`INSERT OR REPLACE INTO ${whTable} (id, value) VALUES (?, ?)`)
  const whDelete = db.prepare(`DELETE FROM ${whTable} WHERE id = ?`)
  const whList = db.prepare(`SELECT value FROM ${whTable}`)

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
      whPut.run(id, JSON.stringify(webhook))
    },
    async getWebhook(id) {
      const row = whGet.get(id) as { value: string } | undefined
      if (!row) return null
      try {
        return JSON.parse(row.value) as WebhookEndpoint
      } catch {
        return null
      }
    },
    async deleteWebhook(id) {
      whDelete.run(id)
    },
    async listWebhooks() {
      const rows = whList.all() as { value: string }[]
      const hooks: WebhookEndpoint[] = []
      for (const row of rows) {
        try {
          hooks.push(JSON.parse(row.value) as WebhookEndpoint)
        } catch {
          // skip corrupt rows
        }
      }
      return hooks
    },
  }
}
