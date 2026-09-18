import { describe, expect, it } from 'vitest'
import { createAuditLog } from '../src/audit'

describe('createAuditLog', () => {
  it('returns entries newest first', () => {
    const log = createAuditLog()
    log.record({ action: 'create', flagKey: 'a', actor: 'me' })
    log.record({ action: 'update', flagKey: 'a', actor: 'me' })
    const entries = log.entries()
    expect(entries[0]!.action).toBe('update')
    expect(entries[1]!.action).toBe('create')
  })

  it('respects the capacity limit', () => {
    const log = createAuditLog(3)
    for (let i = 0; i < 5; i++) {
      log.record({ action: 'create', flagKey: `flag-${i}`, actor: 'me' })
    }
    const entries = log.entries()
    expect(entries).toHaveLength(3)
    expect(entries[0]!.flagKey).toBe('flag-4')
    expect(entries[2]!.flagKey).toBe('flag-2')
  })

  it('includes ISO timestamps', () => {
    const log = createAuditLog()
    log.record({ action: 'delete', flagKey: 'x', actor: 'admin' })
    const [entry] = log.entries()
    expect(entry!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
