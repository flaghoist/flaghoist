import { describe, expect, it } from 'vitest'
import { createFlag, parseFlag } from './validate'

describe('parseFlag', () => {
  it('parses a well-formed flag and clamps the percentage', () => {
    const flag = parseFlag({
      key: 'new-checkout',
      enabled: true,
      rollout: { percentage: 150 },
      description: 'Redesigned checkout',
      metadata: { createdBy: 'ada', createdAt: 't0', updatedBy: 'ada', updatedAt: 't1' },
    })
    expect(flag).not.toBeNull()
    expect(flag?.key).toBe('new-checkout')
    expect(flag?.rollout.percentage).toBe(100)
    expect(flag?.metadata.createdBy).toBe('ada')
  })

  it('rejects non-objects and missing required fields', () => {
    expect(parseFlag(null)).toBeNull()
    expect(parseFlag('nope')).toBeNull()
    expect(parseFlag({ enabled: true })).toBeNull() // no key
    expect(parseFlag({ key: 'k' })).toBeNull() // no enabled
    expect(parseFlag({ key: '', enabled: true })).toBeNull() // empty key
  })

  it('defaults a missing rollout to 0 and fills metadata', () => {
    const flag = parseFlag({ key: 'k', enabled: false })
    expect(flag?.rollout.percentage).toBe(0)
    expect(flag?.description).toBe('')
    expect(typeof flag?.metadata.createdAt).toBe('string')
    expect(flag?.metadata.createdBy).toBe('unknown')
  })

  it('parses valid targeting rules', () => {
    const flag = parseFlag({
      key: 'k',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
          result: { enabled: true, rollout: { percentage: 25 } },
        },
      ],
    })
    expect(flag?.rules).toHaveLength(1)
    expect(flag?.rules?.[0]?.result.rollout?.percentage).toBe(25)
  })

  it('drops a rule with an unknown operator or malformed condition', () => {
    const flag = parseFlag({
      key: 'k',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'regex', value: '.*' }],
          result: { enabled: true },
        },
        { conditions: [{ attribute: 'plan' }], result: { enabled: true } },
      ],
    })
    expect(flag?.rules).toHaveLength(0)
  })
})

describe('createFlag', () => {
  it('applies safe defaults and stamps metadata', () => {
    const flag = createFlag({ key: 'bulk-disbursements', identity: 'ada@acme.com' })
    expect(flag.enabled).toBe(false)
    expect(flag.rollout.percentage).toBe(0)
    expect(flag.rules).toEqual([])
    expect(flag.description).toBe('')
    expect(flag.metadata.createdBy).toBe('ada@acme.com')
    expect(flag.metadata.createdAt).toBe(flag.metadata.updatedAt)
  })

  it('honors provided values and clamps the percentage', () => {
    const flag = createFlag({ key: 'k', enabled: true, rollout: { percentage: 250 } })
    expect(flag.enabled).toBe(true)
    expect(flag.rollout.percentage).toBe(100)
  })
})
