/**
 * Rate limiting for the server. Opt-in: with no `rateLimit` in the config the server behaves
 * exactly as before, because a limiter with the wrong bucket key is worse than none, and only the
 * operator knows how their deployment is fronted.
 *
 * On a single Node or container process the in-memory limiter here is genuinely effective. On
 * Cloudflare Workers it is per-isolate, so it caps a burst against one isolate but not the fleet;
 * the real answer there is Cloudflare's own Rate Limiting rules in front of the Worker. The read
 * path already fails closed under a 429 (an OFREP client returns the caller's default), so limiting
 * it degrades safely.
 */

/** Outcome of a rate-limit check. `retryAfter` is whole seconds until the caller may try again. */
export interface RateLimitResult {
  ok: boolean
  retryAfter?: number
}

/**
 * A rate limiter. `check` decides whether a bucket may proceed; `key` chooses the bucket for a
 * request. Bring your own (a Cloudflare binding, a Redis counter) or use `memoryRateLimit`.
 */
export interface RateLimit {
  check(key: string): RateLimitResult | Promise<RateLimitResult>
  /**
   * Derive the bucket key from request headers. The default trusts `CF-Connecting-IP` (set by
   * Cloudflare and not spoofable there), then the first hop of `X-Forwarded-For`, then a single
   * shared `anonymous` bucket. On a Node process exposed directly, with no proxy setting a
   * forwarded header, every caller lands in that shared bucket, which caps total throughput rather
   * than per-client; supply your own `key` if you have a trustworthy client identifier.
   */
  key?(headers: Headers): string
}

export interface MemoryRateLimitOptions {
  /** Maximum requests allowed per key within the window. Default 120. */
  max?: number
  /** Window length in milliseconds. Default 60000 (one minute). */
  windowMs?: number
  /**
   * Cap on how many distinct keys are tracked, to bound memory against a many-IP flood. When the
   * table is full of live entries the limiter fails open (allows) rather than growing without
   * limit or blocking new clients. Default 100000.
   */
  maxKeys?: number
}

/** The default bucket key: Cloudflare's client IP, then a forwarded header, then a shared bucket. */
export function defaultRateLimitKey(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')
  if (cf) return cf
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return 'anonymous'
}

/**
 * A fixed-window, in-memory rate limiter. Counts requests per key within a window and denies once
 * the count exceeds `max`, reporting the seconds until the window resets. Memory is bounded: expired
 * entries are swept lazily, and if the table stays full the limiter fails open rather than growing.
 */
export function memoryRateLimit(options: MemoryRateLimitOptions = {}): {
  check(key: string): RateLimitResult
  key(headers: Headers): string
} {
  const max = options.max ?? 120
  const windowMs = options.windowMs ?? 60_000
  const maxKeys = options.maxKeys ?? 100_000
  const hits = new Map<string, { count: number; resetAt: number }>()

  const sweep = (now: number): void => {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key)
    }
  }

  return {
    key: defaultRateLimitKey,
    check(key: string): RateLimitResult {
      const now = Date.now()
      let entry = hits.get(key)

      if (!entry || entry.resetAt <= now) {
        if (!hits.has(key) && hits.size >= maxKeys) {
          sweep(now)
          // Still full: a flood of distinct keys. Fail open rather than block new clients or grow.
          if (hits.size >= maxKeys) return { ok: true }
        }
        entry = { count: 0, resetAt: now + windowMs }
        hits.set(key, entry)
      }

      entry.count += 1
      if (entry.count > max) {
        return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
      }
      return { ok: true }
    },
  }
}
