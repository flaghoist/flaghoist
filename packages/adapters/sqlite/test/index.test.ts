import { testStorageAdapter } from '@flaghoist/adapter-conformance'
import { createFlag } from '@flaghoist/core'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { initSqlite, sqliteAdapter } from '../src/index'

function freshAdapter() {
  const db = new Database(':memory:')
  initSqlite(db)
  return sqliteAdapter(db)
}

testStorageAdapter('sqlite', () => freshAdapter())

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
})
