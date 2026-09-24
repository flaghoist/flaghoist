import {
  assertRecordAddress,
  parseFlag,
  type FeatureFlag,
  type RecordEntry,
  type StorageAdapter,
  type WebhookEndpoint,
} from '@flaghoist/core'

/**
 * The minimal structural subset of a `node-postgres` client this adapter uses. A `pg` `Pool` or
 * `Client` satisfies it, so pass yours directly — there is no dependency on a specific driver.
 */
export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

export interface PostgresAdapterOptions {
  /** Table name. Must be a plain SQL identifier. Default: `"flaghoist_flags"`. */
  table?: string

  /** Webhook table name. Must be a plain SQL identifier. Default: `"flaghoist_webhooks"`. */
  webhookTable?: string

  /** Record-store table name. Must be a plain SQL identifier. Default: `"flaghoist_records"`. */
  recordTable?: string
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Table/column identifiers cannot be parameterized in SQL, so the table name is the one spot an
 * injection could enter. Restrict it to a plain SQL identifier and reject anything else.
 */
function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(
      `Invalid Postgres table name ${JSON.stringify(name)}: must match ${IDENTIFIER.source}.`,
    )
  }
  return name
}

/** SQL that creates the flags table. Run once (or via `initPostgres`). */
export function postgresSchema(table = 'flaghoist_flags'): string {
  return `CREATE TABLE IF NOT EXISTS ${assertIdentifier(table)} (key text PRIMARY KEY, value jsonb NOT NULL)`
}

/** SQL that creates the webhooks table. */
export function postgresWebhookSchema(table = 'flaghoist_webhooks'): string {
  return `CREATE TABLE IF NOT EXISTS ${assertIdentifier(table)} (id text PRIMARY KEY, value jsonb NOT NULL)`
}

/** SQL that creates the record-store table. */
export function postgresRecordSchema(table = 'flaghoist_records'): string {
  return `CREATE TABLE IF NOT EXISTS ${assertIdentifier(table)} (collection text NOT NULL, id text NOT NULL, value jsonb NOT NULL, PRIMARY KEY (collection, id))`
}

/** Create the flags, webhooks and record-store tables if they do not already exist. */
export async function initPostgres(
  client: PgQueryable,
  table = 'flaghoist_flags',
  webhookTable = 'flaghoist_webhooks',
  recordTable = 'flaghoist_records',
): Promise<void> {
  await client.query(postgresSchema(table))
  await client.query(postgresWebhookSchema(webhookTable))
  await client.query(postgresRecordSchema(recordTable))
}

// Records are stored inside an envelope object. node-postgres returns jsonb already parsed, and a
// top-level JSON string comes back as a plain JS string, indistinguishable from raw JSON text a
// driver with type parsing turned off would return. Wrapping every value in an object removes the
// ambiguity for both.
const wrapRecord = (value: unknown): string => JSON.stringify({ flaghoistRecord: 1, value })

function unwrapRecord(raw: unknown): unknown | null {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const envelope = parsed as { flaghoistRecord?: unknown; value?: unknown }
  if (envelope.flaghoistRecord !== 1) return null
  return envelope.value ?? null
}

function toFlag(value: unknown): FeatureFlag | null {
  if (value == null) return null
  if (typeof value === 'string') {
    try {
      return parseFlag(JSON.parse(value))
    } catch {
      return null
    }
  }
  return parseFlag(value)
}

/**
 * A StorageAdapter backed by Postgres. Flags live in a `jsonb` table keyed by flag key. All
 * queries are parameterized; every read is re-validated through `parseFlag`, so corrupt rows
 * degrade to "flag ignored". Run `initPostgres` (or `postgresSchema`) once to create the table.
 */
export function postgresAdapter(
  client: PgQueryable,
  options: PostgresAdapterOptions = {},
): StorageAdapter {
  const table = assertIdentifier(options.table ?? 'flaghoist_flags')
  const whTable = assertIdentifier(options.webhookTable ?? 'flaghoist_webhooks')
  const recTable = assertIdentifier(options.recordTable ?? 'flaghoist_records')

  return {
    async get(key) {
      const { rows } = await client.query(`SELECT value FROM ${table} WHERE key = $1`, [key])
      const row = rows[0] as { value: unknown } | undefined
      return row ? toFlag(row.value) : null
    },
    async put(key, flag) {
      await client.query(
        `INSERT INTO ${table} (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(flag)],
      )
    },
    async delete(key) {
      await client.query(`DELETE FROM ${table} WHERE key = $1`, [key])
    },
    async list() {
      const { rows } = await client.query(`SELECT value FROM ${table}`)
      const flags: FeatureFlag[] = []
      for (const row of rows) {
        const flag = toFlag((row as { value: unknown }).value)
        if (flag) flags.push(flag)
      }
      return flags
    },

    async putWebhook(id, webhook) {
      await client.query(
        `INSERT INTO ${whTable} (id, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value`,
        [id, JSON.stringify(webhook)],
      )
    },
    async getWebhook(id) {
      const { rows } = await client.query(`SELECT value FROM ${whTable} WHERE id = $1`, [id])
      const row = rows[0] as { value: unknown } | undefined
      if (!row) return null
      return (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) as WebhookEndpoint
    },
    async deleteWebhook(id) {
      await client.query(`DELETE FROM ${whTable} WHERE id = $1`, [id])
    },
    async listWebhooks() {
      const { rows } = await client.query(`SELECT value FROM ${whTable}`)
      return rows.map((row) => {
        const v = (row as { value: unknown }).value
        return (typeof v === 'string' ? JSON.parse(v) : v) as WebhookEndpoint
      })
    },

    async getRecord(collection, id) {
      assertRecordAddress(collection, id)
      const { rows } = await client.query(
        `SELECT value FROM ${recTable} WHERE collection = $1 AND id = $2`,
        [collection, id],
      )
      const row = rows[0] as { value: unknown } | undefined
      return row ? unwrapRecord(row.value) : null
    },
    async putRecord(collection, id, value) {
      assertRecordAddress(collection, id)
      await client.query(
        `INSERT INTO ${recTable} (collection, id, value) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (collection, id) DO UPDATE SET value = EXCLUDED.value`,
        [collection, id, wrapRecord(value)],
      )
    },
    async deleteRecord(collection, id) {
      assertRecordAddress(collection, id)
      await client.query(`DELETE FROM ${recTable} WHERE collection = $1 AND id = $2`, [
        collection,
        id,
      ])
    },
    async listRecords(collection) {
      assertRecordAddress(collection)
      const { rows } = await client.query(
        `SELECT id, value FROM ${recTable} WHERE collection = $1`,
        [collection],
      )
      const entries: RecordEntry[] = []
      for (const row of rows as { id: string; value: unknown }[]) {
        const value = unwrapRecord(row.value)
        if (value !== null) entries.push({ id: row.id, value })
      }
      return entries
    },
  }
}
