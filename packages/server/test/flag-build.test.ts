import { describe, expect, it } from 'vitest'
import { buildFlag } from '../src/flags'

describe('buildFlag description bound', () => {
  it('rejects an over-long description with a specific message', () => {
    const result = buildFlag('k', { enabled: true, description: 'x'.repeat(3000) }, 'admin', null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Description exceeds/)
  })

  it('accepts a normal description', () => {
    const result = buildFlag('k', { enabled: true, description: 'fine' }, 'admin', null)
    expect(result.ok).toBe(true)
  })
})
