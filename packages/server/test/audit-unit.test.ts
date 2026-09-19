import { describe, expect, it } from 'vitest'
import { createAuditLog } from '../src/audit'

describe('createAuditLog', () => {
  it('returns entries newest first', async () => {
    const log = createAuditLog()
    await log.record({ action: 'create', flagKey: 'a', actor: 'me' })
    await log.record({ action: 'update', flagKey: 'a', actor: 'me' })
    const { entries } = await log.list()
    expect(entries[0]!.action).toBe('update')
    expect(entries[1]!.action).toBe('create')
  })

  it('respects the in-memory capacity limit', async () => {
    const log = createAuditLog()
    for (let i = 0; i < 502; i++) {
      await log.record({ action: 'create', flagKey: `flag-${i}`, actor: 'me' })
    }
    const { entries, total } = await log.list({ limit: 500 })
    expect(total).toBe(500)
    expect(entries[0]!.flagKey).toBe('flag-501')
  })

  it('includes ISO timestamps and unique IDs', async () => {
    const log = createAuditLog()
    await log.record({ action: 'delete', flagKey: 'x', actor: 'admin' })
    const { entries } = await log.list()
    expect(entries[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(entries[0]!.id).toBeTruthy()
  })

  it('stores before/after snapshots', async () => {
    const log = createAuditLog()
    await log.record({
      action: 'update',
      flagKey: 'f',
      actor: 'me',
      previous: { enabled: true, rollout: { percentage: 100 }, description: '' },
      current: { enabled: false, rollout: { percentage: 0 }, description: '' },
    })
    const { entries } = await log.list()
    expect(entries[0]!.previous?.enabled).toBe(true)
    expect(entries[0]!.current?.enabled).toBe(false)
  })

  it('filters by action', async () => {
    const log = createAuditLog()
    await log.record({ action: 'create', flagKey: 'a', actor: 'me' })
    await log.record({ action: 'update', flagKey: 'a', actor: 'me' })
    await log.record({ action: 'delete', flagKey: 'a', actor: 'me' })
    const { entries, total } = await log.list({ action: 'update' })
    expect(total).toBe(1)
    expect(entries[0]!.action).toBe('update')
  })

  it('filters by flagKey', async () => {
    const log = createAuditLog()
    await log.record({ action: 'create', flagKey: 'alpha', actor: 'me' })
    await log.record({ action: 'create', flagKey: 'beta', actor: 'me' })
    const { entries, total } = await log.list({ flagKey: 'beta' })
    expect(total).toBe(1)
    expect(entries[0]!.flagKey).toBe('beta')
  })

  it('paginates with offset and limit', async () => {
    const log = createAuditLog()
    for (let i = 0; i < 10; i++) {
      await log.record({ action: 'create', flagKey: `f-${i}`, actor: 'me' })
    }
    const page1 = await log.list({ limit: 3, offset: 0 })
    const page2 = await log.list({ limit: 3, offset: 3 })
    expect(page1.total).toBe(10)
    expect(page1.entries).toHaveLength(3)
    expect(page2.entries).toHaveLength(3)
    expect(page1.entries[0]!.flagKey).toBe('f-9')
    expect(page2.entries[0]!.flagKey).toBe('f-6')
  })

  it('delegates to storage adapter when audit methods are available', async () => {
    const stored: unknown[] = []
    const storage = {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      list: async () => [],
      async appendAudit(entry: unknown) {
        stored.push(entry)
      },
      async listAudit() {
        return { entries: [...stored].reverse() as never[], total: stored.length }
      },
    }
    const log = createAuditLog(storage)
    await log.record({ action: 'create', flagKey: 'x', actor: 'me' })
    expect(stored).toHaveLength(1)
    const { total } = await log.list()
    expect(total).toBe(1)
  })
})
