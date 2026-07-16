import { parseFlag, type FeatureFlag, type StorageAdapter } from '@flaghoist/core'

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

/** Create the flags table if it does not already exist. */
export async function initPostgres(client: PgQueryable, table = 'flaghoist_flags'): Promise<void> {
  await client.query(postgresSchema(table))
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
  }
}
