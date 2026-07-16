import { testStorageAdapter } from '@flaghoist/adapter-conformance'
import { createFlag } from '@flaghoist/core'
import { newDb } from 'pg-mem'
import { describe, expect, it } from 'vitest'
import { initPostgres, postgresAdapter, type PgQueryable } from '../src/index'

async function freshAdapter(): Promise<ReturnType<typeof postgresAdapter>> {
  const db = newDb()
  const { Pool } = db.adapters.createPg()
  const pool = new Pool() as PgQueryable
  await initPostgres(pool)
  return postgresAdapter(pool)
}

testStorageAdapter('postgres', () => freshAdapter())

describe('postgresAdapter — specifics', () => {
  it('rejects an unsafe table name (SQL injection defense)', () => {
    const db = newDb()
    const { Pool } = db.adapters.createPg()
    const pool = new Pool() as PgQueryable
    expect(() => postgresAdapter(pool, { table: 'flags; DROP TABLE users' })).toThrow(
      /Invalid Postgres table name/,
    )
  })

  it('round-trips a flag with targeting rules through jsonb', async () => {
    const adapter = await freshAdapter()
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
