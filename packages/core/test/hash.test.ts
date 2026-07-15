import { describe, expect, it } from 'vitest'
import { clampPercentage, isInRollout, stickyBucket } from '../src/hash'

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
