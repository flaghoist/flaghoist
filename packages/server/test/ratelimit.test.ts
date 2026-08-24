import { describe, expect, it, vi } from 'vitest'
import { defaultRateLimitKey, memoryRateLimit } from '../src/ratelimit'

describe('memoryRateLimit', () => {
  it('allows up to max, then denies with a Retry-After', () => {
    const rl = memoryRateLimit({ max: 3, windowMs: 60_000 })
    expect(rl.check('a')).toEqual({ ok: true })
    expect(rl.check('a')).toEqual({ ok: true })
    expect(rl.check('a')).toEqual({ ok: true })
    const denied = rl.check('a')
    expect(denied.ok).toBe(false)
    expect(denied.retryAfter).toBeGreaterThan(0)
  })

  it('buckets per key, so one key does not starve another', () => {
    const rl = memoryRateLimit({ max: 1, windowMs: 60_000 })
    expect(rl.check('a').ok).toBe(true)
    expect(rl.check('a').ok).toBe(false)
    expect(rl.check('b').ok).toBe(true) // different bucket
  })

  it('resets after the window passes', () => {
    vi.useFakeTimers()
    try {
      const rl = memoryRateLimit({ max: 1, windowMs: 1000 })
      expect(rl.check('a').ok).toBe(true)
      expect(rl.check('a').ok).toBe(false)
      vi.advanceTimersByTime(1001)
      expect(rl.check('a').ok).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails open rather than growing past maxKeys', () => {
    const rl = memoryRateLimit({ max: 1, windowMs: 60_000, maxKeys: 2 })
    expect(rl.check('a').ok).toBe(true)
    expect(rl.check('b').ok).toBe(true)
    // Table full of live entries; a third distinct key is allowed rather than blocked or tracked.
    expect(rl.check('c').ok).toBe(true)
  })
})

describe('defaultRateLimitKey', () => {
  it('prefers the Cloudflare client IP', () => {
    const h = new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })
    expect(defaultRateLimitKey(h)).toBe('1.2.3.4')
  })

  it('falls back to the first forwarded hop', () => {
    const h = new Headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' })
    expect(defaultRateLimitKey(h)).toBe('5.6.7.8')
  })

  it('shares an anonymous bucket when no client identifier is present', () => {
    expect(defaultRateLimitKey(new Headers())).toBe('anonymous')
  })
})
