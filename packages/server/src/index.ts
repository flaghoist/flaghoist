import { evaluate, type EvaluationContext } from '@flaghoist/core'
import { Hono } from 'hono'
import { createDefinitionCache } from './cache'
import { buildFlag } from './flags'
import { openApiDocument } from './openapi'
import { defaultRateLimitKey } from './ratelimit'
import type { ConfigResolver, ServerConfig } from './types'

export { apiKey, bearerToken, oidc, type OidcOptions } from './auth'
export {
  defaultRateLimitKey,
  memoryRateLimit,
  type MemoryRateLimitOptions,
  type RateLimit,
  type RateLimitResult,
} from './ratelimit'
export { openApiDocument } from './openapi'
export type { AuthResult, Authenticator, ConfigResolver, ServerConfig } from './types'

const DEFAULT_CACHE_TTL_SECONDS = 30
const MAX_BODY_BYTES = 64 * 1024

type ReadBody = { ok: true; value: unknown } | { ok: false; status: 400 | 413; message: string }

async function readJsonBody(text: string): Promise<ReadBody> {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, message: 'Payload too large' }
  }
  if (!text) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 400, message: 'Invalid JSON body' }
  }
}

function ttlMs(cfg: ServerConfig): number {
  return (cfg.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS) * 1000
}

function resolveContext(body: unknown, cfg: ServerConfig, headers: Headers): EvaluationContext {
  const client =
    body &&
    typeof body === 'object' &&
    'context' in body &&
    typeof (body as Record<string, unknown>).context === 'object'
      ? ((body as Record<string, unknown>).context as Record<string, unknown>)
      : {}
  const trusted = cfg.trustedContext?.(headers) ?? {}
  return { ...client, ...trusted } as EvaluationContext
}

/**
 * Build a Flaghoist server as a Hono app. Pass a config object, or a function that derives the
 * config from the runtime environment (e.g. Cloudflare Workers bindings). The returned app has a
 * `fetch` handler, so `export default createFlagServer(...)` works as a Worker entrypoint.
 */
export function createFlagServer<Env extends object = Record<string, unknown>>(
  config: ConfigResolver<Env>,
) {
  const cache = createDefinitionCache()
  const resolve = (env: unknown): ServerConfig =>
    typeof config === 'function' ? (config as (env: Env) => ServerConfig)(env as Env) : config
  const app = new Hono<{ Bindings: Env }>()

  // Apply the CORS allowlist on every request.
  app.use('*', async (c, next) => {
    const cfg = resolve(c.env)

    const origin = c.req.header('Origin')
    if (origin && cfg.allowedOrigins?.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin)
      c.header('Access-Control-Allow-Credentials', 'true')
      c.header('Vary', 'Origin')
    }
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')
      return c.body(null, 204)
    }
    return next()
  })

  // Rate limiting, when configured. After CORS (so preflight OPTIONS is already answered and is not
  // counted) and before auth (so credential-guessing is throttled too). /health is exempt, since
  // uptime monitors hit it often and it reveals nothing.
  app.use('*', async (c, next) => {
    const cfg = resolve(c.env)
    if (!cfg.rateLimit || c.req.path === '/health') return next()
    const deriveKey = cfg.rateLimit.key ?? defaultRateLimitKey
    const result = await cfg.rateLimit.check(deriveKey(c.req.raw.headers))
    if (!result.ok) {
      if (result.retryAfter) c.header('Retry-After', String(result.retryAfter))
      return c.json({ error: 'Too many requests' }, 429)
    }
    return next()
  })

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.get('/api/v1/openapi.json', (c) => c.json(openApiDocument))

  // ---- Admin dashboard SPA (served at /admin when a build is configured) ----

  app.get('/admin', (c) => {
    const cfg = resolve(c.env)
    return cfg.dashboard ? c.html(cfg.dashboard) : c.text('Dashboard not configured', 404)
  })
  app.get('/admin/*', (c) => {
    const cfg = resolve(c.env)
    return cfg.dashboard ? c.html(cfg.dashboard) : c.text('Dashboard not configured', 404)
  })

  // ---- OFREP read path (API-key auth) ----

  /**
   * Map an internal evaluation reason onto the OFREP wire.
   *
   * OpenFeature clients read `DISABLED` as "this flag is not participating, so use the default you
   * passed in". The Go OFREP provider does exactly that: it discards our `value: false` and returns
   * the caller's default, so a service written as `BooleanValue(ctx, "feature", true, ...)`, the
   * usual kill-switch shape, keeps serving the feature after it has been switched off. The
   * JavaScript provider honours the value instead, so the same flag answered differently per
   * language.
   *
   * Flaghoist means something narrower than OpenFeature does: a disabled flag is off, and the value
   * is false. `STATIC` says the value did not come from dynamic evaluation, which is true here, and
   * carries no instruction to substitute anything.
   */
  const wireReason = (reason: string): string => (reason === 'DISABLED' ? 'STATIC' : reason)

  app.post('/ofrep/v1/evaluate/flags', async (c) => {
    const cfg = resolve(c.env)
    const auth = await cfg.auth.read(c.req.raw.headers)
    if (!auth.ok) {
      return c.json({ errorCode: 'GENERAL', errorDetails: auth.message }, auth.status ?? 401)
    }
    const parsed = await readJsonBody(await c.req.text())
    if (!parsed.ok) {
      const errorCode = parsed.status === 413 ? 'GENERAL' : 'PARSE_ERROR'
      return c.json({ errorCode, errorDetails: parsed.message }, parsed.status)
    }
    const context = resolveContext(parsed.value, cfg, c.req.raw.headers)
    const flags = await cache.load(cfg.storage, ttlMs(cfg))
    const results = await Promise.all(
      flags.map(async (flag) => {
        const result = await evaluate(flag, context)
        return {
          key: flag.key,
          value: result.value,
          reason: wireReason(result.reason),
          variant: result.value ? 'on' : 'off',
        }
      }),
    )
    return c.json({ flags: results })
  })

  app.post('/ofrep/v1/evaluate/flags/:key', async (c) => {
    const cfg = resolve(c.env)
    const key = c.req.param('key')
    const auth = await cfg.auth.read(c.req.raw.headers)
    if (!auth.ok) {
      return c.json({ key, errorCode: 'GENERAL', errorDetails: auth.message }, auth.status ?? 401)
    }
    const parsed = await readJsonBody(await c.req.text())
    if (!parsed.ok) {
      const errorCode = parsed.status === 413 ? 'GENERAL' : 'PARSE_ERROR'
      return c.json({ key, errorCode, errorDetails: parsed.message }, parsed.status)
    }
    const context = resolveContext(parsed.value, cfg, c.req.raw.headers)
    const flags = await cache.load(cfg.storage, ttlMs(cfg))
    const flag = flags.find((f) => f.key === key)
    if (!flag) {
      return c.json(
        { key, errorCode: 'FLAG_NOT_FOUND', errorDetails: `Flag ${key} not found` },
        404,
      )
    }
    const result = await evaluate(flag, context)
    return c.json({
      key,
      value: result.value,
      reason: wireReason(result.reason),
      variant: result.value ? 'on' : 'off',
    })
  })

  // ---- Admin CRUD (admin auth) — served under /api/v1 and the legacy unversioned alias ----

  const registerAdmin = (prefix: string) => {
    app.get(`${prefix}/flags`, async (c) => {
      const cfg = resolve(c.env)
      const auth = await cfg.auth.admin(c.req.raw.headers)
      if (!auth.ok) return c.json({ error: auth.message ?? 'Unauthorized' }, auth.status ?? 401)
      return c.json({ flags: await cfg.storage.list() })
    })

    app.get(`${prefix}/flags/:key`, async (c) => {
      const cfg = resolve(c.env)
      const auth = await cfg.auth.admin(c.req.raw.headers)
      if (!auth.ok) return c.json({ error: auth.message ?? 'Unauthorized' }, auth.status ?? 401)
      const flag = await cfg.storage.get(c.req.param('key'))
      if (!flag) return c.json({ error: 'Flag not found' }, 404)
      return c.json(flag)
    })

    app.put(`${prefix}/flags/:key`, async (c) => {
      const cfg = resolve(c.env)
      const auth = await cfg.auth.admin(c.req.raw.headers)
      if (!auth.ok) return c.json({ error: auth.message ?? 'Unauthorized' }, auth.status ?? 401)
      const key = c.req.param('key')
      const parsed = await readJsonBody(await c.req.text())
      if (!parsed.ok) return c.json({ error: parsed.message }, parsed.status)
      const built = buildFlag(
        key,
        parsed.value,
        auth.identity ?? 'unknown',
        await cfg.storage.get(key),
      )
      if (!built.ok) return c.json({ error: built.error }, 400)
      await cfg.storage.put(key, built.flag)
      cache.invalidate()
      return c.json(built.flag)
    })

    app.delete(`${prefix}/flags/:key`, async (c) => {
      const cfg = resolve(c.env)
      const auth = await cfg.auth.admin(c.req.raw.headers)
      if (!auth.ok) return c.json({ error: auth.message ?? 'Unauthorized' }, auth.status ?? 401)
      await cfg.storage.delete(c.req.param('key'))
      cache.invalidate()
      return c.body(null, 204)
    })
  }

  registerAdmin('/api/v1')
  registerAdmin('') // legacy unversioned alias — /flags maps to /api/v1/flags

  app.onError((err, c) => {
    console.error('[flaghoist] unhandled error', err)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}
