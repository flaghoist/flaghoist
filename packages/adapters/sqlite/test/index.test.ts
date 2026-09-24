import {
  testRecordStorage,
  testStorageAdapter,
  testWebhookStorage,
} from '@flaghoist/adapter-conformance'
import { createFlag } from '@flaghoist/core'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { initSqlite, sqliteAdapter, sqliteSchema } from '../src/index'

function freshAdapter() {
  const db = new Database(':memory:')
  initSqlite(db)
  return sqliteAdapter(db)
}

testStorageAdapter('sqlite', () => freshAdapter())
testWebhookStorage('sqlite', () => freshAdapter())
testRecordStorage('sqlite', () => freshAdapter())

describe('sqliteAdapter -- specifics', () => {
  it('rejects an unsafe table name (SQL injection defense)', () => {
    const db = new Database(':memory:')
    expect(() => sqliteAdapter(db, { table: 'flags; DROP TABLE users' })).toThrow(
      /Invalid SQLite table name/,
    )
  })

  it('round-trips a flag with targeting rules through JSON text', async () => {
    const adapter = freshAdapter()
    const flag = createFlag({
      key: 'beta',
      enabled: true,
      rollout: { percentage: 40 },
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
          result: { enabled: true, rollout: { percentage: 25 } },
        },
      ],
    })
    await adapter.put('beta', flag)
    expect(await adapter.get('beta')).toEqual(flag)
  })

  it('starts against a database that only has the flags table', async () => {
    // Databases set up with sqliteSchema() alone, before webhooks and records existed, must still
    // boot. Only the optional features fail, and only when used, with a pointer to the fix.
    const db = new Database(':memory:')
    db.exec(sqliteSchema())
    const adapter = sqliteAdapter(db)

    await adapter.put('k', createFlag({ key: 'k', enabled: true }))
    expect((await adapter.get('k'))?.enabled).toBe(true)
    await expect(adapter.listWebhooks!()).rejects.toThrow(/initSqlite/)
    await expect(adapter.listRecords!('users')).rejects.toThrow(/initSqlite/)
  })

  it('honours a custom record table name', async () => {
    const db = new Database(':memory:')
    initSqlite(db, 'flaghoist_flags', 'flaghoist_webhooks', 'app_records')
    const adapter = sqliteAdapter(db, { recordTable: 'app_records' })
    await adapter.putRecord!('users', 'u1', { a: 1 })
    const row = db
      .prepare('SELECT value FROM app_records WHERE collection = ? AND id = ?')
      .get('users', 'u1') as { value: string }
    expect(JSON.parse(row.value)).toEqual({ a: 1 })
  })
})
