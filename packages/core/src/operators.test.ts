import { describe, expect, it } from 'vitest'
import { compareSemver, matchCondition, matchesAllConditions } from './operators'
import type { Condition, EvaluationContext } from './types'

function match(
  attribute: string,
  operator: Condition['operator'],
  value: Condition['value'],
  context: EvaluationContext,
): boolean {
  return matchCondition({ attribute, operator, value }, context)
}

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
