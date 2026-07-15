import { describe, expect, it } from 'vitest'
import {
  clampPercentage,
  compareSemver,
  createFlag,
  evaluate,
  evaluateAll,
  isInRollout,
  isValidFlagKey,
  LIMITS,
  matchCondition,
  matchesAllConditions,
  parseFlag,
  stickyBucket,
  version,
  type Condition,
  type EvaluationContext,
  type TargetingRule,
} from '../src/index'

function match(
  attribute: string,
  operator: Condition['operator'],
  value: Condition['value'],
  context: EvaluationContext,
): boolean {
  return matchCondition({ attribute, operator, value }, context)
}

describe('clampPercentage', () => {
  it('clamps into [0, 100] and maps NaN to 0', () => {
    expect(clampPercentage(50)).toBe(50)
    expect(clampPercentage(-10)).toBe(0)
    expect(clampPercentage(150)).toBe(100)
    expect(clampPercentage(Number.NaN)).toBe(0)
  })
})

describe('stickyBucket', () => {
  it('returns a bucket in [0, 100)', async () => {
    for (const seed of ['a', 'user-1:flag', 'x'.repeat(64), '']) {
      const bucket = await stickyBucket(seed)
      expect(bucket).toBeGreaterThanOrEqual(0)
      expect(bucket).toBeLessThan(100)
    }
  })

  it('is deterministic for the same seed', async () => {
    const a = await stickyBucket('partner-42:new-checkout')
    const b = await stickyBucket('partner-42:new-checkout')
    expect(a).toBe(b)
  })

  it('separates different seeds', async () => {
    const a = await stickyBucket('partner-42:new-checkout')
    const b = await stickyBucket('partner-99:new-checkout')
    // Not a strict guarantee, but these two known seeds differ.
    expect(a).not.toBe(b)
  })
})

describe('isInRollout', () => {
  it('treats 100% (and above) as always in, 0% (and below) as always out', async () => {
    expect(await isInRollout('anyone', 'flag', 100)).toBe(true)
    expect(await isInRollout('anyone', 'flag', 150)).toBe(true)
    expect(await isInRollout('anyone', 'flag', 0)).toBe(false)
    expect(await isInRollout('anyone', 'flag', -5)).toBe(false)
  })

  it('is sticky — the same key/flag always resolves the same way', async () => {
    const first = await isInRollout('partner-7', 'beta', 50)
    for (let i = 0; i < 5; i++) {
      expect(await isInRollout('partner-7', 'beta', 50)).toBe(first)
    }
  })

  it('distributes roughly in proportion to the percentage', async () => {
    const N = 2000
    let inCount = 0
    for (let i = 0; i < N; i++) {
      if (await isInRollout(`user-${i}`, 'rollout-flag', 25)) inCount++
    }
    const ratio = inCount / N
    // 25% target; allow a generous statistical band.
    expect(ratio).toBeGreaterThan(0.2)
    expect(ratio).toBeLessThan(0.3)
  })
})

describe('matchCondition — equality and membership', () => {
  const ctx: EvaluationContext = { plan: 'beta', seats: 5, trial: true, country: 'NG' }

  it('eq / neq', () => {
    expect(match('plan', 'eq', 'beta', ctx)).toBe(true)
    expect(match('plan', 'eq', 'pro', ctx)).toBe(false)
    expect(match('plan', 'neq', 'pro', ctx)).toBe(true)
    expect(match('trial', 'eq', true, ctx)).toBe(true)
    expect(match('seats', 'eq', 5, ctx)).toBe(true)
  })

  it('does not coerce across types for eq', () => {
    expect(match('seats', 'eq', '5', ctx)).toBe(false)
  })

  it('in / notIn', () => {
    expect(match('country', 'in', ['NG', 'GH', 'KE'], ctx)).toBe(true)
    expect(match('country', 'in', ['US', 'CA'], ctx)).toBe(false)
    expect(match('country', 'notIn', ['US', 'CA'], ctx)).toBe(true)
    expect(match('country', 'notIn', ['NG'], ctx)).toBe(false)
  })
})

describe('matchCondition — strings', () => {
  const ctx: EvaluationContext = { email: 'ada@acme.com' }

  it('contains / startsWith / endsWith', () => {
    expect(match('email', 'contains', '@acme', ctx)).toBe(true)
    expect(match('email', 'startsWith', 'ada', ctx)).toBe(true)
    expect(match('email', 'endsWith', '.com', ctx)).toBe(true)
    expect(match('email', 'endsWith', '.org', ctx)).toBe(false)
  })
})

describe('matchCondition — numbers', () => {
  const ctx: EvaluationContext = { seats: 10 }

  it('gt / gte / lt / lte', () => {
    expect(match('seats', 'gt', 5, ctx)).toBe(true)
    expect(match('seats', 'gt', 10, ctx)).toBe(false)
    expect(match('seats', 'gte', 10, ctx)).toBe(true)
    expect(match('seats', 'lt', 20, ctx)).toBe(true)
    expect(match('seats', 'lte', 10, ctx)).toBe(true)
  })

  it('coerces numeric strings for ordered comparison', () => {
    expect(match('seats', 'gte', 10, { seats: '10' } as unknown as EvaluationContext)).toBe(true)
  })
})

describe('matchCondition — semver', () => {
  const ctx: EvaluationContext = { appVersion: '2.3.1' }

  it('semverGte / semverLt', () => {
    expect(match('appVersion', 'semverGte', '2.1.0', ctx)).toBe(true)
    expect(match('appVersion', 'semverGte', '2.3.1', ctx)).toBe(true)
    expect(match('appVersion', 'semverGte', '2.4.0', ctx)).toBe(false)
    expect(match('appVersion', 'semverLt', '3.0.0', ctx)).toBe(true)
  })
})

describe('matchCondition — missing attributes and type guards', () => {
  it('never matches when the attribute is absent from context', () => {
    const ctx: EvaluationContext = {}
    expect(match('plan', 'eq', 'beta', ctx)).toBe(false)
    expect(match('plan', 'neq', 'beta', ctx)).toBe(false)
    expect(match('appVersion', 'semverGte', '1.0.0', ctx)).toBe(false)
  })

  it('returns false for type-incompatible comparisons', () => {
    expect(match('plan', 'contains', 'x', { plan: 42 } as unknown as EvaluationContext)).toBe(false)
    expect(match('plan', 'in', 'not-an-array' as never, { plan: 'beta' })).toBe(false)
  })
})

describe('matchesAllConditions', () => {
  const ctx: EvaluationContext = { plan: 'beta', country: 'NG' }

  it('requires every condition (logical AND)', () => {
    expect(
      matchesAllConditions(
        [
          { attribute: 'plan', operator: 'eq', value: 'beta' },
          { attribute: 'country', operator: 'in', value: ['NG', 'GH'] },
        ],
        ctx,
      ),
    ).toBe(true)

    expect(
      matchesAllConditions(
        [
          { attribute: 'plan', operator: 'eq', value: 'beta' },
          { attribute: 'country', operator: 'eq', value: 'US' },
        ],
        ctx,
      ),
    ).toBe(false)
  })

  it('matches everyone when there are no conditions', () => {
    expect(matchesAllConditions([], ctx)).toBe(true)
  })
})

describe('compareSemver', () => {
  it('orders core versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1)
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0)
  })

  it('ranks a release above its prerelease', () => {
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
  })
})

describe('evaluate — enabled gate', () => {
  it('serves off with reason DISABLED when the flag is disabled', async () => {
    const flag = createFlag({ key: 'k', enabled: false, rollout: { percentage: 100 } })
    expect(await evaluate(flag, { targetingKey: 'anyone' })).toEqual({
      value: false,
      reason: 'DISABLED',
    })
  })
})

describe('evaluate — default rollout (no rules)', () => {
  it('is fully on at 100% and fully off at 0%', async () => {
    const on = createFlag({ key: 'on', enabled: true, rollout: { percentage: 100 } })
    const off = createFlag({ key: 'off', enabled: true, rollout: { percentage: 0 } })
    expect(await evaluate(on, { targetingKey: 'x' })).toEqual({ value: true, reason: 'DEFAULT' })
    expect(await evaluate(off, { targetingKey: 'x' })).toEqual({ value: false, reason: 'DEFAULT' })
  })

  it('splits deterministically at a partial percentage', async () => {
    const flag = createFlag({ key: 'split', enabled: true, rollout: { percentage: 50 } })
    const result = await evaluate(flag, { targetingKey: 'user-1' })
    expect(result.reason).toBe('SPLIT')
    expect(result.value).toBe(await isInRollout('user-1', 'split', 50))
    // sticky across repeated evaluations
    expect((await evaluate(flag, { targetingKey: 'user-1' })).value).toBe(result.value)
  })

  it('behaves identically to a plain boolean flag when rules are absent', async () => {
    const flag = createFlag({ key: 'plain', enabled: true, rollout: { percentage: 100 } })
    expect((await evaluate(flag)).value).toBe(true)
  })
})

describe('evaluate — targeting rules (first match wins)', () => {
  const rules: TargetingRule[] = [
    {
      conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
      result: { enabled: true },
    },
    {
      conditions: [{ attribute: 'country', operator: 'eq', value: 'NG' }],
      result: { enabled: false },
    },
  ]
  const flag = createFlag({ key: 'checkout', enabled: true, rollout: { percentage: 0 }, rules })

  it('takes the first matching rule even when a later rule also matches', async () => {
    // Matches both rule 0 (plan=beta) and rule 1 (country=NG); rule 0 wins → on.
    expect(await evaluate(flag, { targetingKey: 'u', plan: 'beta', country: 'NG' })).toEqual({
      value: true,
      reason: 'TARGETING_MATCH',
      ruleIndex: 0,
    })
  })

  it('supports a rule that disables the flag for a cohort (kill switch)', async () => {
    // Only rule 1 matches (plan is not beta) → off.
    expect(await evaluate(flag, { targetingKey: 'u', plan: 'pro', country: 'NG' })).toEqual({
      value: false,
      reason: 'TARGETING_MATCH',
      ruleIndex: 1,
    })
  })

  it('falls through to the default rollout when no rule matches', async () => {
    expect(await evaluate(flag, { targetingKey: 'u', plan: 'pro', country: 'US' })).toEqual({
      value: false,
      reason: 'DEFAULT',
    })
  })
})

describe('evaluate — per-rule rollout', () => {
  it('applies a percentage within the matched cohort', async () => {
    const flag = createFlag({
      key: 'ramp',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
          result: { enabled: true, rollout: { percentage: 50 } },
        },
      ],
    })
    const result = await evaluate(flag, { targetingKey: 'user-1', plan: 'beta' })
    expect(result.reason).toBe('SPLIT')
    expect(result.ruleIndex).toBe(0)
    expect(result.value).toBe(await isInRollout('user-1', 'ramp', 50))
  })
})

describe('evaluateAll', () => {
  it('evaluates many flags against one context, keyed by flag key', async () => {
    const flags = [
      createFlag({ key: 'a', enabled: true, rollout: { percentage: 100 } }),
      createFlag({ key: 'b', enabled: false, rollout: { percentage: 100 } }),
    ]
    const all = await evaluateAll(flags, { targetingKey: 'x' })
    expect(all.a?.value).toBe(true)
    expect(all.b?.value).toBe(false)
    expect(all.b?.reason).toBe('DISABLED')
  })
})

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

describe('@flaghoist/core public API', () => {
  it('exports the evaluation and schema helpers', () => {
    expect(typeof evaluate).toBe('function')
    expect(typeof evaluateAll).toBe('function')
    expect(typeof matchCondition).toBe('function')
    expect(typeof matchesAllConditions).toBe('function')
    expect(typeof isInRollout).toBe('function')
    expect(typeof stickyBucket).toBe('function')
    expect(typeof compareSemver).toBe('function')
    expect(typeof parseFlag).toBe('function')
    expect(typeof createFlag).toBe('function')
    expect(version).toBe('0.0.0')
  })
})
