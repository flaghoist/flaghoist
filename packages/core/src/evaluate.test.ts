import { describe, expect, it } from 'vitest'
import { evaluate, evaluateAll } from './evaluate'
import { isInRollout } from './hash'
import { createFlag } from './validate'
import type { TargetingRule } from './types'

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
