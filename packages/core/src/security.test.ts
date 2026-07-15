import { describe, expect, it } from 'vitest'
import { matchCondition } from './operators'
import { isValidFlagKey, LIMITS } from './limits'
import type { EvaluationContext, TargetingRule } from './types'
import { createFlag, parseFlag } from './validate'

describe('isValidFlagKey', () => {
  it('accepts URL- and storage-safe keys', () => {
    for (const key of ['new-checkout', 'bulk_disbursements', 'v2.payments', 'ABC123', 'a']) {
      expect(isValidFlagKey(key)).toBe(true)
    }
  })

  it('rejects traversal, separators, spaces, and control characters', () => {
    for (const key of ['../secret', 'a/b', 'a\\b', 'has space', 'tab\there', 'new\nline', '']) {
      expect(isValidFlagKey(key)).toBe(false)
    }
  })

  it('rejects leading punctuation and over-length keys', () => {
    expect(isValidFlagKey('.hidden')).toBe(false)
    expect(isValidFlagKey('-flag')).toBe(false)
    expect(isValidFlagKey('_flag')).toBe(false)
    expect(isValidFlagKey('a'.repeat(LIMITS.maxKeyLength + 1))).toBe(false)
  })
})

describe('parseFlag / createFlag — key safety', () => {
  it('parseFlag rejects a flag with an unsafe key', () => {
    expect(parseFlag({ key: '../etc/passwd', enabled: true })).toBeNull()
    expect(parseFlag({ key: 'a/b', enabled: true })).toBeNull()
  })

  it('createFlag throws on an unsafe key', () => {
    expect(() => createFlag({ key: '../secret' })).toThrow(/Invalid flag key/)
    expect(() => createFlag({ key: 'a b' })).toThrow(/Invalid flag key/)
  })
})

describe('prototype-pollution defenses', () => {
  it('drops a rule that targets a forbidden attribute name', () => {
    const flag = parseFlag({
      key: 'k',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [
        {
          conditions: [{ attribute: '__proto__', operator: 'eq', value: 'x' }],
          result: { enabled: true },
        },
        {
          conditions: [{ attribute: 'constructor', operator: 'eq', value: 'x' }],
          result: { enabled: true },
        },
      ],
    })
    expect(flag?.rules).toHaveLength(0)
  })

  it('never matches a forbidden attribute name at evaluation time', () => {
    const ctx: EvaluationContext = { plan: 'beta' }
    expect(matchCondition({ attribute: '__proto__', operator: 'eq', value: 'x' }, ctx)).toBe(false)
    expect(matchCondition({ attribute: 'constructor', operator: 'eq', value: 'x' }, ctx)).toBe(
      false,
    )
  })

  it('reads only own properties, never inherited ones', () => {
    const withInherited = Object.create({ plan: 'beta' }) as EvaluationContext
    // `plan` exists on the prototype, not as an own property — must not match.
    expect(
      matchCondition({ attribute: 'plan', operator: 'eq', value: 'beta' }, withInherited),
    ).toBe(false)
  })
})

describe('resource caps', () => {
  it('rejects a flag exceeding the rule cap', () => {
    const rules: TargetingRule[] = Array.from({ length: LIMITS.maxRules + 1 }, () => ({
      conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
      result: { enabled: true },
    }))
    expect(parseFlag({ key: 'k', enabled: true, rollout: { percentage: 0 }, rules })).toBeNull()
  })

  it('drops a rule exceeding the conditions cap', () => {
    const conditions = Array.from({ length: LIMITS.maxConditionsPerRule + 1 }, () => ({
      attribute: 'plan',
      operator: 'eq',
      value: 'beta',
    }))
    const flag = parseFlag({
      key: 'k',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [{ conditions, result: { enabled: true } }],
    })
    expect(flag?.rules).toHaveLength(0)
  })

  it('drops a rule whose condition list or string value is oversized', () => {
    const bigList = parseFlag({
      key: 'k',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [
        {
          conditions: [
            {
              attribute: 'country',
              operator: 'in',
              value: Array.from({ length: LIMITS.maxListItems + 1 }, (_, i) => `c${i}`),
            },
          ],
          result: { enabled: true },
        },
      ],
    })
    expect(bigList?.rules).toHaveLength(0)

    const bigValue = parseFlag({
      key: 'k',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [
        {
          conditions: [
            { attribute: 'note', operator: 'eq', value: 'x'.repeat(LIMITS.maxValueLength + 1) },
          ],
          result: { enabled: true },
        },
      ],
    })
    expect(bigValue?.rules).toHaveLength(0)
  })
})
