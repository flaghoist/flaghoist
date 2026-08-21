import { describe, expect, it } from 'vitest'
import * as core from '../src/index'

describe('@flaghoist/core public API', () => {
  it('exports the evaluation and schema helpers', () => {
    expect(typeof core.evaluate).toBe('function')
    expect(typeof core.evaluateAll).toBe('function')
    expect(typeof core.matchCondition).toBe('function')
    expect(typeof core.matchesAllConditions).toBe('function')
    expect(typeof core.isInRollout).toBe('function')
    expect(typeof core.stickyBucket).toBe('function')
    expect(typeof core.compareSemver).toBe('function')
    expect(typeof core.parseFlag).toBe('function')
    expect(typeof core.createFlag).toBe('function')
  })
})
