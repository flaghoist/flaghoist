import {
  auditCategory,
  evaluate,
  WEBHOOK_EVENTS,
  type AuditAction,
  type EvaluationContext,
  type FeatureFlag,
  type FlagSnapshot,
  type WebhookEvent,
} from '@flaghoist/core'
import { Hono, type Context } from 'hono'
import {
  assertUsersConfig,
  createAccountStore,
  decodeClientKey,
  decodeSalt,
  normalizeEmail,
  normalizeName,
  PASSWORD_ITERATIONS,
  PASSWORD_KDF,
  publicInvite,
  publicSession,
  publicUser,
  SESSION_PREFIX,
  type AccountStore,
  type InviteRecord,
  type SessionRecord,
  type UserRecord,
} from './accounts'
import { createAuditLog } from './audit'
import { extractBearer } from './auth'
import { createDefinitionCache, type DefinitionCache } from './cache'
import { resolveAdminEnvironment, resolveReadEnvironment, scopedStorage } from './environments'
import { buildFlag, flagEtag } from './flags'
import { openApiDocument } from './openapi'
import { can, isRole, minimumRole, ROLES, type Permission, type Role } from './permissions'
import { defaultRateLimitKey, memoryRateLimit } from './ratelimit'
import type { ConfigResolver, ServerConfig } from './types'
import {
  createWebhookStore,
  dispatchWebhooks,
  generateId,
  generateSecret,
  sign as signWebhook,
  validateWebhookInput,
  type WebhookPayload,
} from './webhooks'

export type { PublicInvite, PublicSession, PublicUser, UsersConfig } from './accounts'
export type { AuditEntry, AuditLog, AuditPage, FlagSnapshot } from './audit'
export { apiKey, apiKeys, bearerToken, oidc, type OidcOptions } from './auth'
export {
  resolveAdminEnvironment,
  resolveReadEnvironment,
  scopedStorage,
  type EnvironmentResolution,
} from './environments'
export {
  defaultRateLimitKey,
  memoryRateLimit,
  type MemoryRateLimitOptions,
  type RateLimit,
  type RateLimitResult,
} from './ratelimit'
export { openApiDocument } from './openapi'
export { can, minimumRole, ROLES, type Permission, type Role } from './permissions'
export type { AuthResult, Authenticator, ConfigResolver, ServerConfig } from './types'
export type { WebhookPayload } from './webhooks'

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
  // One definition cache per environment: a write to staging must not invalidate production's
  // cached flag set, and vice versa. Keyed by environment name, created lazily on first use.
  const caches = new Map<string, DefinitionCache>()
  function cacheFor(environment: string): DefinitionCache {
    let c = caches.get(environment)
    if (!c) {
      c = createDefinitionCache()
      caches.set(environment, c)
    }
    return c
  }

  const resolve = (env: unknown): ServerConfig => {
    const cfg =
      typeof config === 'function' ? (config as (env: Env) => ServerConfig)(env as Env) : config
    if (cfg.users) assertUsersConfig(cfg.users, cfg.storage)
    return cfg
  }
  const directConfig = typeof config === 'function' ? null : config
  // A static config is checked now, so a server that cannot keep accounts refuses to start rather
  // than failing on its first request. A config function is checked on every request instead.
  if (directConfig?.users) assertUsersConfig(directConfig.users, directConfig.storage)
  const audit = createAuditLog(directConfig?.storage)
  const webhookStore = createWebhookStore(directConfig?.storage)

  function defaultEnvOf(cfg: ServerConfig): string {
    return cfg.defaultEnvironment ?? 'production'
  }

  function snapshot(flag: FeatureFlag): FlagSnapshot {
    return { enabled: flag.enabled, rollout: flag.rollout, description: flag.description }
  }

  function fireWebhook(
    event: WebhookEvent,
    flagKey: string,
    actor: string,
    environment: string | undefined,
    current?: FlagSnapshot,
    previous?: FlagSnapshot,
  ) {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      flag: {
        key: flagKey,
        enabled: current?.enabled ?? previous?.enabled ?? false,
        rollout: current?.rollout ?? previous?.rollout ?? { percentage: 0 },
        description: current?.description ?? previous?.description ?? '',
      },
      actor,
      previous,
      environment,
    }
    dispatchWebhooks(webhookStore, event, payload).catch(() => {})
  }

  function accountsOf(cfg: ServerConfig): AccountStore | null {
    return cfg.users ? createAccountStore(cfg.storage, cfg.users) : null
  }

  type Caller = {
    cfg: ServerConfig
    identity: string
    /** Null when the verifier reported a role this server does not recognise. */
    role: Role | null
    /** The signed-in account, when the credential is a session token. */
    user: UserRecord | null
    session: SessionRecord | null
    token: string | null
  }
  type Authorized = Caller & { role: Role }

  /**
   * Identify the caller of an admin request. With accounts on, a session token is resolved against
   * the session store; anything else goes to the configured `auth.admin` verifier, which becomes
   * the break-glass credential. A verifier that reports no role gets `owner`, the full access every
   * admin verifier had before roles existed.
   */
  async function authenticate(c: Context<{ Bindings: Env }>): Promise<Caller | Response> {
    const cfg = resolve(c.env)
    const token = extractBearer(c.req.raw.headers)
    const accounts = accountsOf(cfg)
    if (accounts && token?.startsWith(SESSION_PREFIX)) {
      const resolved = await accounts.resolveSession(token)
      if (!resolved) {
        return c.json(
          { error: 'Your session has ended. Sign in again.', code: 'session_expired' },
          401,
        )
      }
      const { user, session } = resolved
      return { cfg, identity: user.email, role: user.role, user, session, token }
    }
    const auth = await cfg.auth.admin(c.req.raw.headers)
    if (!auth.ok) return c.json({ error: auth.message ?? 'Unauthorized' }, auth.status ?? 401)
    const role = auth.role === undefined ? 'owner' : isRole(auth.role) ? auth.role : null
    // With accounts on, the shared bearer token is the break-glass credential. Say so in the audit
    // log, so a change made with it stands out from one made by a named person.
    const breakGlass = accounts !== null && auth.role === undefined && auth.identity === 'admin'
    const identity = breakGlass ? 'owner (break-glass)' : (auth.identity ?? 'unknown')
    return { cfg, identity, role, user: null, session: null, token }
  }

  /**
   * Authenticate an admin request and check its role holds `permission`. Returns the caller, or the
   * error response to send. A role that is not recognised gets nothing. Permission failures carry
   * `code: "insufficient_role"` so a client can tell them apart from a rejected credential, which
   * is also a 403.
   */
  async function authorize(
    c: Context<{ Bindings: Env }>,
    permission: Permission,
  ): Promise<Authorized | Response> {
    const caller = await authenticate(c)
    if (caller instanceof Response) return caller
    if (caller.role === null || !can(caller.role, permission)) {
      return c.json(
        {
          error: `This needs the ${minimumRole(permission)} role or higher.`,
          code: 'insufficient_role',
        },
        403,
      )
    }
    return caller as Authorized
  }

  const app = new Hono<{ Bindings: Env }>()

  // Baseline security headers on every response. The dashboard is the primary beneficiary but the
  // headers are harmless on API JSON too. default-src 'none' blocks everything not explicitly
  // allowed; script/style 'unsafe-inline' is required because vite-plugin-singlefile inlines all
  // JS and CSS into the HTML. connect-src is wide because the admin URL is user-provided.
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'connect-src *',
    'img-src data:',
    'font-src data:',
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')

  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Content-Security-Policy', csp)
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()')
  })

  // Apply the CORS allowlist on every request.
  app.use('*', async (c, next) => {
    const cfg = resolve(c.env)

    const origin = c.req.header('Origin')
    if (origin && cfg.allowedOrigins?.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin)
      // Deliberately no Access-Control-Allow-Credentials. Flaghoist authenticates with headers
      // (x-api-key, Authorization), which a browser does not attach cross-origin on its own, so
      // credentialed CORS buys nothing and would be a latent hole the day a cookie or session flow
      // is added. Add it back consciously alongside such a flow, never by default.
      c.header('Vary', 'Origin')
    }
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      c.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, x-api-key, If-Match, X-Flaghoist-Environment',
      )
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

  app.get('/api/v1/openapi.json', (c) => {
    const cfg = resolve(c.env)
    // Unauthenticated and describes the whole API, so it is opt-out for a deployment that would
    // rather not hand a scanner the route map. On by default, to keep tooling working.
    if (cfg.exposeOpenApi === false) return c.text('Not found', 404)
    return c.json(openApiDocument)
  })

  // ---- Admin dashboard SPA (served at /admin when a build is configured) ----

  // The SPA payload is large relative to an API JSON response, so it gets its own fixed-window
  // rate limit (30 req/min per IP) that is always on, separate from the configurable API limiter.
  const dashboardLimiter = memoryRateLimit({ max: 30, windowMs: 60_000 })

  app.get('/admin', async (c) => {
    const cfg = resolve(c.env)
    if (!cfg.dashboard) return c.text('Dashboard not configured', 404)
    const ip = defaultRateLimitKey(c.req.raw.headers)
    const result = dashboardLimiter.check(`admin:${ip}`)
    if (!result.ok) {
      if (result.retryAfter) c.header('Retry-After', String(result.retryAfter))
      return c.text('Too many requests', 429)
    }
    return c.html(cfg.dashboard)
  })
  app.get('/admin/*', async (c) => {
    const cfg = resolve(c.env)
    if (!cfg.dashboard) return c.text('Dashboard not configured', 404)
    const ip = defaultRateLimitKey(c.req.raw.headers)
    const result = dashboardLimiter.check(`admin:${ip}`)
    if (!result.ok) {
      if (result.retryAfter) c.header('Retry-After', String(result.retryAfter))
      return c.text('Too many requests', 429)
    }
    return c.html(cfg.dashboard)
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
    const defaultEnv = defaultEnvOf(cfg)
    const environment = resolveReadEnvironment(cfg.environments, defaultEnv, auth.environment)
    const scoped = scopedStorage(cfg.storage, environment, defaultEnv)
    const flags = await cacheFor(environment).load(scoped, ttlMs(cfg))
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
    const defaultEnv = defaultEnvOf(cfg)
    const environment = resolveReadEnvironment(cfg.environments, defaultEnv, auth.environment)
    const scoped = scopedStorage(cfg.storage, environment, defaultEnv)
    const flags = await cacheFor(environment).load(scoped, ttlMs(cfg))
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
      const authorized = await authorize(c, 'flags:read')
      if (authorized instanceof Response) return authorized
      const { cfg } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const scoped = scopedStorage(cfg.storage, envResult.environment, defaultEnv)
      const all = await scoped.list()
      const includeArchived = c.req.query('includeArchived') === 'true'
      return c.json({ flags: includeArchived ? all : all.filter((f) => !f.archived) })
    })

    app.get(`${prefix}/flags/:key`, async (c) => {
      const authorized = await authorize(c, 'flags:read')
      if (authorized instanceof Response) return authorized
      const { cfg } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const scoped = scopedStorage(cfg.storage, envResult.environment, defaultEnv)
      const flag = await scoped.get(c.req.param('key'))
      if (!flag) return c.json({ error: 'Flag not found' }, 404)
      c.header('ETag', flagEtag(flag))
      return c.json(flag)
    })

    app.put(`${prefix}/flags/:key`, async (c) => {
      const authorized = await authorize(c, 'flags:write')
      if (authorized instanceof Response) return authorized
      const { cfg, identity } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const environment = envResult.environment
      const scoped = scopedStorage(cfg.storage, environment, defaultEnv)
      const key = c.req.param('key')
      const existing = await scoped.get(key)

      // Optimistic concurrency, opt-in. A client that sends `If-Match` asserts the version it last
      // saw; if the stored flag has moved on (or was deleted) since, reject with 412 rather than
      // silently overwriting whoever wrote in between. `If-Match: *` means "must still exist". A
      // request with no `If-Match` keeps the previous last-write-wins behaviour, so the CLI and
      // existing integrations are unaffected.
      const ifMatch = c.req.header('If-Match')?.trim()
      if (ifMatch !== undefined) {
        const precondition =
          ifMatch === '*' ? existing !== null : existing !== null && flagEtag(existing) === ifMatch
        if (!precondition) {
          return c.json(
            { error: 'This flag changed since you loaded it. Reload and reapply your change.' },
            412,
          )
        }
      }

      const parsed = await readJsonBody(await c.req.text())
      if (!parsed.ok) return c.json({ error: parsed.message }, parsed.status)
      const changeDescription =
        parsed.value &&
        typeof parsed.value === 'object' &&
        typeof (parsed.value as Record<string, unknown>).changeDescription === 'string'
          ? ((parsed.value as Record<string, unknown>).changeDescription as string).trim() ||
            undefined
          : undefined
      const built = buildFlag(key, parsed.value, identity, existing)
      if (!built.ok) return c.json({ error: built.error }, 400)
      await scoped.put(key, built.flag)
      cacheFor(environment).invalidate()
      const flagAction = existing ? 'update' : 'create'
      const auditEnv = cfg.environments ? environment : undefined
      await audit.record({
        action: flagAction,
        flagKey: key,
        actor: identity,
        previous: existing ? snapshot(existing) : undefined,
        current: snapshot(built.flag),
        changeDescription,
        environment: auditEnv,
      })
      fireWebhook(
        `flag.${flagAction === 'update' ? 'updated' : 'created'}`,
        key,
        identity,
        auditEnv,
        snapshot(built.flag),
        existing ? snapshot(existing) : undefined,
      )
      c.header('ETag', flagEtag(built.flag))
      return c.json(built.flag)
    })

    app.post(`${prefix}/flags/:key/archive`, async (c) => {
      const authorized = await authorize(c, 'flags:write')
      if (authorized instanceof Response) return authorized
      const { cfg, identity } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const environment = envResult.environment
      const scoped = scopedStorage(cfg.storage, environment, defaultEnv)
      const key = c.req.param('key')
      const existing = await scoped.get(key)
      if (!existing) return c.json({ error: 'Flag not found' }, 404)
      if (existing.archived) return c.json({ error: 'Flag is already archived' }, 409)
      const archived: typeof existing = {
        ...existing,
        archived: true,
        archivedAt: new Date().toISOString(),
      }
      await scoped.put(key, archived)
      cacheFor(environment).invalidate()
      const auditEnv = cfg.environments ? environment : undefined
      await audit.record({
        action: 'archive',
        flagKey: key,
        actor: identity,
        previous: snapshot(existing),
        environment: auditEnv,
      })
      fireWebhook('flag.archived', key, identity, auditEnv, undefined, snapshot(existing))
      return c.json(archived)
    })

    app.post(`${prefix}/flags/:key/restore`, async (c) => {
      const authorized = await authorize(c, 'flags:write')
      if (authorized instanceof Response) return authorized
      const { cfg, identity } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const environment = envResult.environment
      const scoped = scopedStorage(cfg.storage, environment, defaultEnv)
      const key = c.req.param('key')
      const existing = await scoped.get(key)
      if (!existing) return c.json({ error: 'Flag not found' }, 404)
      if (!existing.archived) return c.json({ error: 'Flag is not archived' }, 409)
      const { archived: _, archivedAt: __, ...rest } = existing
      const restored = rest as typeof existing
      await scoped.put(key, restored)
      cacheFor(environment).invalidate()
      const auditEnv = cfg.environments ? environment : undefined
      await audit.record({
        action: 'restore',
        flagKey: key,
        actor: identity,
        current: snapshot(restored),
        environment: auditEnv,
      })
      fireWebhook('flag.restored', key, identity, auditEnv, snapshot(restored))
      return c.json(restored)
    })

    app.delete(`${prefix}/flags/:key`, async (c) => {
      const authorized = await authorize(c, 'flags:delete')
      if (authorized instanceof Response) return authorized
      const { cfg, identity } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const environment = envResult.environment
      const scoped = scopedStorage(cfg.storage, environment, defaultEnv)
      const key = c.req.param('key')
      const existing = await scoped.get(key)
      await scoped.delete(key)
      cacheFor(environment).invalidate()
      const auditEnv = cfg.environments ? environment : undefined
      await audit.record({
        action: 'delete',
        flagKey: key,
        actor: identity,
        previous: existing ? snapshot(existing) : undefined,
        environment: auditEnv,
      })
      if (existing) {
        fireWebhook('flag.deleted', key, identity, auditEnv, undefined, snapshot(existing))
      }
      return c.body(null, 204)
    })

    app.get(`${prefix}/export`, async (c) => {
      const authorized = await authorize(c, 'flags:read')
      if (authorized instanceof Response) return authorized
      const { cfg } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const scoped = scopedStorage(cfg.storage, envResult.environment, defaultEnv)
      const all = await scoped.list()
      const active = all.filter((f) => !f.archived)
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        flags: active.map((f) => ({
          key: f.key,
          enabled: f.enabled,
          rollout: f.rollout,
          description: f.description,
          ...(f.rules && f.rules.length > 0 ? { rules: f.rules } : {}),
        })),
      }
      c.header('Content-Disposition', 'attachment; filename="flaghoist-export.json"')
      return c.json(payload)
    })

    app.post(`${prefix}/import`, async (c) => {
      const authorized = await authorize(c, 'flags:import')
      if (authorized instanceof Response) return authorized
      const { cfg, identity } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const environment = envResult.environment
      const scoped = scopedStorage(cfg.storage, environment, defaultEnv)
      const parsed = await readJsonBody(await c.req.text())
      if (!parsed.ok) return c.json({ error: parsed.message }, parsed.status)
      const body = parsed.value as Record<string, unknown>
      if (!body || typeof body !== 'object' || !Array.isArray(body.flags)) {
        return c.json({ error: 'Expected { flags: [...] }' }, 400)
      }
      const incoming = body.flags as unknown[]
      if (incoming.length > 500) {
        return c.json({ error: 'Import limited to 500 flags' }, 400)
      }
      const auditEnv = cfg.environments ? environment : undefined
      let created = 0
      let updated = 0
      const errors: { key: string; error: string }[] = []
      for (const raw of incoming) {
        const obj = raw as Record<string, unknown>
        if (!obj || typeof obj !== 'object' || typeof obj.key !== 'string') {
          errors.push({ key: String(obj?.key ?? '(missing)'), error: 'Missing or invalid key' })
          continue
        }
        const existing = await scoped.get(obj.key)
        const built = buildFlag(obj.key, obj, identity, existing)
        if (!built.ok) {
          errors.push({ key: obj.key, error: built.error })
          continue
        }
        await scoped.put(obj.key, built.flag)
        await audit.record({
          action: existing ? 'update' : 'create',
          flagKey: obj.key,
          actor: identity,
          previous: existing ? snapshot(existing) : undefined,
          current: snapshot(built.flag),
          changeDescription: 'Bulk import',
          environment: auditEnv,
        })
        if (existing) updated++
        else created++
      }
      cacheFor(environment).invalidate()
      return c.json({ created, updated, errors })
    })

    app.get(`${prefix}/audit`, async (c) => {
      const security = c.req.query('category') === 'security'
      const authorized = await authorize(c, security ? 'audit:security' : 'audit:read')
      if (authorized instanceof Response) return authorized
      const { cfg } = authorized
      const defaultEnv = defaultEnvOf(cfg)
      const envResult = resolveAdminEnvironment(cfg.environments, defaultEnv, c.req.raw.headers)
      if (!envResult.ok) return c.json({ error: envResult.message }, envResult.status)
      const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 200)
      const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0)
      const category = security ? 'security' : 'flags'
      const action = c.req.query('action') as AuditAction | undefined
      const validAction = action && auditCategory(action) === category ? action : undefined
      if (security) {
        // Security events belong to the deployment, not to an environment.
        const page = await audit.list({ limit, offset, category, action: validAction })
        return c.json({ ...page, entries: page.entries.filter((e) => !e.flagKey) })
      }
      const flagKey = c.req.query('flagKey') || undefined
      const environment = cfg.environments ? envResult.environment : undefined
      const page = await audit.list({
        limit,
        offset,
        category,
        flagKey,
        action: validAction,
        environment,
      })
      // An adapter written before categories existed returns both kinds; keep this list to flags.
      return c.json({ ...page, entries: page.entries.filter((e) => e.flagKey !== undefined) })
    })

    app.get(`${prefix}/environments`, async (c) => {
      const authorized = await authorize(c, 'flags:read')
      if (authorized instanceof Response) return authorized
      const { cfg } = authorized
      const defaultEnvironment = defaultEnvOf(cfg)
      const environments =
        cfg.environments && cfg.environments.length > 0 ? cfg.environments : [defaultEnvironment]
      return c.json({ environments, default: defaultEnvironment })
    })

    // ---- Webhook CRUD ----

    app.get(`${prefix}/webhooks`, async (c) => {
      const authorized = await authorize(c, 'webhooks:manage')
      if (authorized instanceof Response) return authorized
      return c.json({ webhooks: await webhookStore.list() })
    })

    app.get(`${prefix}/webhooks/:id`, async (c) => {
      const authorized = await authorize(c, 'webhooks:manage')
      if (authorized instanceof Response) return authorized
      const hook = await webhookStore.get(c.req.param('id'))
      if (!hook) return c.json({ error: 'Webhook not found' }, 404)
      return c.json(hook)
    })

    app.post(`${prefix}/webhooks`, async (c) => {
      const authorized = await authorize(c, 'webhooks:manage')
      if (authorized instanceof Response) return authorized
      const parsed = await readJsonBody(await c.req.text())
      if (!parsed.ok) return c.json({ error: parsed.message }, parsed.status)
      const validated = validateWebhookInput(parsed.value)
      if (!validated.ok) return c.json({ error: validated.error }, 400)
      const now = new Date().toISOString()
      const hook = {
        id: generateId(),
        url: validated.value.url,
        secret: generateSecret(),
        events: validated.value.events ?? [...WEBHOOK_EVENTS],
        enabled: validated.value.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      }
      await webhookStore.put(hook.id, hook)
      await audit.record({
        action: 'webhook.created',
        target: { type: 'webhook', id: hook.id },
        actor: authorized.identity,
        changeDescription: hook.url,
      })
      return c.json(hook, 201)
    })

    app.put(`${prefix}/webhooks/:id`, async (c) => {
      const authorized = await authorize(c, 'webhooks:manage')
      if (authorized instanceof Response) return authorized
      const id = c.req.param('id')
      const existing = await webhookStore.get(id)
      if (!existing) return c.json({ error: 'Webhook not found' }, 404)
      const parsed = await readJsonBody(await c.req.text())
      if (!parsed.ok) return c.json({ error: parsed.message }, parsed.status)
      const obj = parsed.value as Record<string, unknown>

      if (obj.url !== undefined) {
        const v = validateWebhookInput({ url: obj.url })
        if (!v.ok) return c.json({ error: v.error }, 400)
        existing.url = v.value.url
      }
      if (obj.events !== undefined) {
        if (!Array.isArray(obj.events)) return c.json({ error: 'events must be an array' }, 400)
        for (const e of obj.events) {
          if (!WEBHOOK_EVENTS.includes(e as WebhookEvent)) {
            return c.json({ error: `Unknown event: ${String(e)}` }, 400)
          }
        }
        existing.events = obj.events as WebhookEvent[]
      }
      if (obj.enabled !== undefined) {
        if (typeof obj.enabled !== 'boolean') {
          return c.json({ error: 'enabled must be a boolean' }, 400)
        }
        existing.enabled = obj.enabled
      }
      existing.updatedAt = new Date().toISOString()
      await webhookStore.put(id, existing)
      await audit.record({
        action: 'webhook.updated',
        target: { type: 'webhook', id },
        actor: authorized.identity,
        changeDescription: existing.url,
      })
      return c.json(existing)
    })

    app.delete(`${prefix}/webhooks/:id`, async (c) => {
      const authorized = await authorize(c, 'webhooks:manage')
      if (authorized instanceof Response) return authorized
      const id = c.req.param('id')
      const existing = await webhookStore.get(id)
      if (!existing) return c.json({ error: 'Webhook not found' }, 404)
      await webhookStore.delete(id)
      await audit.record({
        action: 'webhook.deleted',
        target: { type: 'webhook', id },
        actor: authorized.identity,
        changeDescription: existing.url,
      })
      return c.body(null, 204)
    })

    app.post(`${prefix}/webhooks/:id/test`, async (c) => {
      const authorized = await authorize(c, 'webhooks:manage')
      if (authorized instanceof Response) return authorized
      const { identity } = authorized
      const hook = await webhookStore.get(c.req.param('id'))
      if (!hook) return c.json({ error: 'Webhook not found' }, 404)
      const payload: WebhookPayload = {
        event: 'flag.updated',
        timestamp: new Date().toISOString(),
        flag: {
          key: 'test-flag',
          enabled: true,
          rollout: { percentage: 100 },
          description: 'Test webhook delivery',
        },
        actor: identity,
      }
      try {
        const body = JSON.stringify(payload)
        const signature = await signWebhook(hook.secret, body)
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Flaghoist-Event': 'flag.updated',
            'X-Flaghoist-Signature': signature,
            'X-Flaghoist-Webhook-Id': hook.id,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        })
        return c.json({ status: res.status, ok: res.ok })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Request failed'
        return c.json({ status: 0, ok: false, error: message })
      }
    })
  }

  // ---- Accounts: sign-in, sessions and the signed-in user's own account (/api/v1 only) ----

  const accountsOff = (c: Context<{ Bindings: Env }>) =>
    c.json({ error: 'Accounts are not enabled on this server.', code: 'accounts_disabled' }, 404)

  async function readBody(
    c: Context<{ Bindings: Env }>,
  ): Promise<Record<string, unknown> | Response> {
    const parsed = await readJsonBody(await c.req.text())
    if (!parsed.ok) return c.json({ error: parsed.message }, parsed.status)
    const value = parsed.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return c.json({ error: 'Expected a JSON object' }, 400)
    }
    return value as Record<string, unknown>
  }

  function clientIp(c: Context<{ Bindings: Env }>): string {
    return defaultRateLimitKey(c.req.raw.headers)
  }

  function fromIp(ip: string): string | undefined {
    return ip === 'anonymous' ? undefined : `From ${ip}`
  }

  function throttledResponse(c: Context<{ Bindings: Env }>, retryAfterSeconds: number) {
    const minutes = Math.ceil(retryAfterSeconds / 60)
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(
      {
        error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        code: 'login_throttled',
      },
      429,
    )
  }

  app.get('/api/v1/auth/config', async (c) => {
    const cfg = resolve(c.env)
    const accounts = accountsOf(cfg)
    if (!accounts) return c.json({ accounts: false })
    return c.json({
      accounts: true,
      password: { kdf: PASSWORD_KDF, iterations: PASSWORD_ITERATIONS },
      setupRequired: (await accounts.count()) === 0,
    })
  })

  app.post('/api/v1/auth/prelogin', async (c) => {
    const accounts = accountsOf(resolve(c.env))
    if (!accounts) return accountsOff(c)
    const body = await readBody(c)
    if (body instanceof Response) return body
    const email = normalizeEmail(body.email)
    if (!email) return c.json({ error: 'Enter a valid email address.' }, 400)
    return c.json(await accounts.passwordParams(email))
  })

  app.post('/api/v1/auth/login', async (c) => {
    const accounts = accountsOf(resolve(c.env))
    if (!accounts) return accountsOff(c)
    const body = await readBody(c)
    if (body instanceof Response) return body
    const email = normalizeEmail(body.email)
    const clientKey = decodeClientKey(body.clientKey)
    if (!email || !clientKey) return c.json({ error: 'Enter your email and password.' }, 400)

    const ip = clientIp(c)
    const throttle = await accounts.throttled(email, ip)
    if (!throttle.ok) return throttledResponse(c, throttle.retryAfterSeconds)

    const user = await accounts.findByEmail(email)
    if (!(await accounts.checkPassword(user, clientKey))) {
      await accounts.recordFailure(email, ip)
      await audit.record({
        action: 'login.failed',
        actor: email,
        ...(user ? { target: { type: 'user' as const, id: user.id } } : {}),
        changeDescription: user?.status === 'disabled' ? 'Account is disabled' : fromIp(ip),
      })
      return c.json({ error: 'Invalid email or password.', code: 'invalid_credentials' }, 401)
    }
    const signedIn = user as UserRecord
    await accounts.clearFailures(email)
    await accounts.recordLogin(signedIn)
    const { token, session } = await accounts.createSession(signedIn, c.req.header('user-agent'))
    await audit.record({
      action: 'login',
      actor: signedIn.email,
      target: { type: 'user', id: signedIn.id },
      changeDescription: fromIp(ip),
    })
    return c.json({ token, expiresAt: session.expiresAt, user: publicUser(signedIn) })
  })

  app.post('/api/v1/auth/logout', async (c) => {
    const caller = await authenticate(c)
    if (caller instanceof Response) return caller
    const accounts = accountsOf(caller.cfg)
    if (accounts && caller.session && caller.token) {
      await accounts.endSession(caller.token)
      await audit.record({
        action: 'logout',
        actor: caller.identity,
        target: { type: 'session', id: caller.session.id },
      })
    }
    return c.body(null, 204)
  })

  app.get('/api/v1/auth/me', async (c) => {
    const caller = await authenticate(c)
    if (caller instanceof Response) return caller
    return c.json({
      identity: caller.identity,
      role: caller.role,
      accounts: caller.cfg.users !== undefined,
      user: caller.user ? publicUser(caller.user) : null,
      session: caller.session
        ? {
            id: caller.session.id,
            createdAt: caller.session.createdAt,
            expiresAt: caller.session.expiresAt,
          }
        : null,
    })
  })

  // First run: with accounts on and none created yet, the break-glass credential creates the first
  // Owner. Everyone after that is invited.
  app.post('/api/v1/auth/setup', async (c) => {
    const caller = await authenticate(c)
    if (caller instanceof Response) return caller
    const accounts = accountsOf(caller.cfg)
    if (!accounts) return accountsOff(c)
    if (caller.role !== 'owner' || caller.user) {
      return c.json(
        { error: 'Only the admin token can create the first account.', code: 'insufficient_role' },
        403,
      )
    }
    if ((await accounts.count()) > 0) {
      return c.json(
        { error: 'An account already exists. Sign in with it instead.', code: 'setup_complete' },
        409,
      )
    }
    const body = await readBody(c)
    if (body instanceof Response) return body
    const email = normalizeEmail(body.email)
    const salt = decodeSalt(body.salt)
    const clientKey = decodeClientKey(body.clientKey)
    if (!email) return c.json({ error: 'Enter a valid email address.' }, 400)
    if (!salt || !clientKey) return c.json({ error: 'Missing or malformed password key.' }, 400)
    const user = await accounts.createUser({
      email,
      name: normalizeName(body.name),
      role: 'owner',
      salt,
      clientKey,
    })
    if (!user) return c.json({ error: 'That email already has an account.' }, 409)
    await audit.record({
      action: 'user.created',
      actor: caller.identity,
      target: { type: 'user', id: user.id },
      changeDescription: `${user.email} as owner`,
    })
    return c.json({ user: publicUser(user) }, 201)
  })

  /** The signed-in account, for routes that act on it. The break-glass token has none. */
  async function signedInUser(
    c: Context<{ Bindings: Env }>,
  ): Promise<
    (Caller & { user: UserRecord; session: SessionRecord; accounts: AccountStore }) | Response
  > {
    const caller = await authenticate(c)
    if (caller instanceof Response) return caller
    const accounts = accountsOf(caller.cfg)
    if (!accounts) return accountsOff(c)
    if (!caller.user || !caller.session) {
      return c.json(
        { error: 'Sign in with an account to manage it.', code: 'account_required' },
        400,
      )
    }
    return { ...caller, user: caller.user, session: caller.session, accounts }
  }

  app.put('/api/v1/me/password', async (c) => {
    const caller = await signedInUser(c)
    if (caller instanceof Response) return caller
    const { accounts, user, session } = caller
    const body = await readBody(c)
    if (body instanceof Response) return body
    const currentKey = decodeClientKey(body.currentClientKey)
    const salt = decodeSalt(body.salt)
    const clientKey = decodeClientKey(body.clientKey)
    if (!currentKey || !salt || !clientKey) {
      return c.json({ error: 'Missing or malformed password key.' }, 400)
    }
    const ip = clientIp(c)
    const throttle = await accounts.throttled(user.email, ip)
    if (!throttle.ok) return throttledResponse(c, throttle.retryAfterSeconds)
    if (!(await accounts.checkPassword(user, currentKey))) {
      await accounts.recordFailure(user.email, ip)
      return c.json({ error: 'Your current password is incorrect.', code: 'invalid_password' }, 400)
    }
    await accounts.setPassword(user, salt, clientKey)
    // A new password signs out every other session, in case the old one leaked.
    const others = (await accounts.sessionsFor(user.id)).filter((s) => s.session.id !== session.id)
    await Promise.all(others.map((s) => accounts.deleteSessionKey(s.key)))
    await audit.record({
      action: 'password.changed',
      actor: user.email,
      target: { type: 'user', id: user.id },
      changeDescription:
        others.length > 0
          ? `Signed out ${others.length} other session${others.length === 1 ? '' : 's'}`
          : undefined,
    })
    return c.json({ revokedSessions: others.length })
  })

  app.get('/api/v1/me/sessions', async (c) => {
    const caller = await signedInUser(c)
    if (caller instanceof Response) return caller
    const sessions = (await caller.accounts.sessionsFor(caller.user.id))
      .map((s) => publicSession(s.session, caller.session.id))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    return c.json({ sessions })
  })

  app.delete('/api/v1/me/sessions', async (c) => {
    const caller = await signedInUser(c)
    if (caller instanceof Response) return caller
    const others = (await caller.accounts.sessionsFor(caller.user.id)).filter(
      (s) => s.session.id !== caller.session.id,
    )
    await Promise.all(others.map((s) => caller.accounts.deleteSessionKey(s.key)))
    if (others.length > 0) {
      await audit.record({
        action: 'session.revoked',
        actor: caller.user.email,
        target: { type: 'user', id: caller.user.id },
        changeDescription: `Signed out ${others.length} other session${others.length === 1 ? '' : 's'}`,
      })
    }
    return c.json({ revoked: others.length })
  })

  app.delete('/api/v1/me/sessions/:id', async (c) => {
    const caller = await signedInUser(c)
    if (caller instanceof Response) return caller
    const id = c.req.param('id')
    const match = (await caller.accounts.sessionsFor(caller.user.id)).find(
      (s) => s.session.id === id,
    )
    if (!match) return c.json({ error: 'Session not found' }, 404)
    await caller.accounts.deleteSessionKey(match.key)
    await audit.record({
      action: 'session.revoked',
      actor: caller.user.email,
      target: { type: 'session', id },
    })
    return c.body(null, 204)
  })

  // ---- Members: invites, reset links, roles (admin and up; owners only for the owner role) ----

  type MemberCaller = Authorized & { accounts: AccountStore }

  async function memberAdmin(c: Context<{ Bindings: Env }>): Promise<MemberCaller | Response> {
    const authorized = await authorize(c, 'members:manage')
    if (authorized instanceof Response) return authorized
    const accounts = accountsOf(authorized.cfg)
    if (!accounts) return accountsOff(c)
    return { ...authorized, accounts }
  }

  const ownersOnly = (c: Context<{ Bindings: Env }>) =>
    c.json({ error: 'Only an owner can manage owners.', code: 'insufficient_role' }, 403)

  /** Whether removing, disabling or demoting `user` would leave no active owner. */
  async function isLastOwner(accounts: AccountStore, user: UserRecord): Promise<boolean> {
    if (user.role !== 'owner' || user.status !== 'active') return false
    const owners = (await accounts.listUsers()).filter(
      (u) => u.role === 'owner' && u.status === 'active',
    )
    return owners.length <= 1
  }

  const lastOwner = (c: Context<{ Bindings: Env }>) =>
    c.json(
      {
        error: 'This is the only owner. Make someone else an owner first.',
        code: 'last_owner',
      },
      409,
    )

  const notYourself = (c: Context<{ Bindings: Env }>, what: string) =>
    c.json({ error: `You cannot ${what} yourself.`, code: 'self_change' }, 409)

  function linkResponse(token: string, invite: InviteRecord) {
    return { token, invite: publicInvite(invite) }
  }

  app.get('/api/v1/users', async (c) => {
    const caller = await memberAdmin(c)
    if (caller instanceof Response) return caller
    const [users, lastActive] = await Promise.all([
      caller.accounts.listUsers(),
      caller.accounts.lastActive(),
    ])
    return c.json({
      users: users.map((u) => {
        const seen = lastActive.get(u.id)
        return { ...publicUser(u), ...(seen ? { lastActiveAt: seen } : {}) }
      }),
    })
  })

  app.put('/api/v1/users/:id', async (c) => {
    const caller = await memberAdmin(c)
    if (caller instanceof Response) return caller
    const { accounts } = caller
    const user = await accounts.getUser(c.req.param('id'))
    if (!user) return c.json({ error: 'Member not found' }, 404)
    const body = await readBody(c)
    if (body instanceof Response) return body

    if (body.role !== undefined && !isRole(body.role)) {
      return c.json({ error: `role must be one of ${ROLES.join(', ')}` }, 400)
    }
    if (body.status !== undefined && body.status !== 'active' && body.status !== 'disabled') {
      return c.json({ error: 'status must be active or disabled' }, 400)
    }
    const role = (body.role as Role | undefined) ?? user.role
    const status = (body.status as 'active' | 'disabled' | undefined) ?? user.status
    const name = body.name !== undefined ? normalizeName(body.name) : user.name
    const roleChanged = role !== user.role
    const statusChanged = status !== user.status

    if ((user.role === 'owner' || role === 'owner') && caller.role !== 'owner') {
      if (roleChanged || statusChanged) return ownersOnly(c)
    }
    if (caller.user?.id === user.id && (roleChanged || statusChanged)) {
      return notYourself(c, roleChanged ? 'change the role of' : 'disable')
    }
    if ((roleChanged || status === 'disabled') && (await isLastOwner(accounts, user))) {
      return lastOwner(c)
    }

    const saved = await accounts.saveUser({ ...user, role, status, name })
    // Losing access takes effect now: a disabled or demoted member signs in again, or not at all.
    const demoted = ROLES.indexOf(role) < ROLES.indexOf(user.role)
    if (status === 'disabled' || demoted) await accounts.revokeSessionsFor(user.id)

    const changes: string[] = []
    if (roleChanged) changes.push(`role ${user.role} to ${role}`)
    if (statusChanged) changes.push(status === 'disabled' ? 'disabled' : 'enabled')
    if (name !== user.name) changes.push('name changed')
    if (changes.length > 0) {
      await audit.record({
        action: 'user.updated',
        actor: caller.identity,
        target: { type: 'user', id: user.id },
        changeDescription: `${user.email}: ${changes.join(', ')}`,
      })
    }
    return c.json(publicUser(saved))
  })

  app.delete('/api/v1/users/:id', async (c) => {
    const caller = await memberAdmin(c)
    if (caller instanceof Response) return caller
    const { accounts } = caller
    const user = await accounts.getUser(c.req.param('id'))
    if (!user) return c.json({ error: 'Member not found' }, 404)
    if (user.role === 'owner' && caller.role !== 'owner') return ownersOnly(c)
    if (caller.user?.id === user.id) return notYourself(c, 'remove')
    if (await isLastOwner(accounts, user)) return lastOwner(c)
    await accounts.removeUser(user)
    await audit.record({
      action: 'user.removed',
      actor: caller.identity,
      target: { type: 'user', id: user.id },
      changeDescription: user.email,
    })
    return c.body(null, 204)
  })

  app.post('/api/v1/users/:id/reset', async (c) => {
    const caller = await memberAdmin(c)
    if (caller instanceof Response) return caller
    const { accounts } = caller
    const user = await accounts.getUser(c.req.param('id'))
    if (!user) return c.json({ error: 'Member not found' }, 404)
    if (user.role === 'owner' && caller.role !== 'owner') return ownersOnly(c)
    if (caller.user?.id === user.id) {
      return c.json(
        {
          error: 'Change your own password from the Account page instead.',
          code: 'self_change',
        },
        409,
      )
    }
    const { token, invite } = await accounts.createInvite({
      kind: 'reset',
      email: user.email,
      role: user.role,
      userId: user.id,
      invitedBy: caller.identity,
    })
    await audit.record({
      action: 'password.reset',
      actor: caller.identity,
      target: { type: 'user', id: user.id },
      changeDescription: `Reset link for ${user.email}`,
    })
    return c.json(linkResponse(token, invite), 201)
  })

  app.get('/api/v1/invites', async (c) => {
    const caller = await memberAdmin(c)
    if (caller instanceof Response) return caller
    const invites = (await caller.accounts.listInvites()).filter((i) => i.kind === 'invite')
    return c.json({ invites: invites.map(publicInvite) })
  })

  app.post('/api/v1/invites', async (c) => {
    const caller = await memberAdmin(c)
    if (caller instanceof Response) return caller
    const { accounts } = caller
    const body = await readBody(c)
    if (body instanceof Response) return body
    const email = normalizeEmail(body.email)
    if (!email) return c.json({ error: 'Enter a valid email address.' }, 400)
    const role = body.role ?? 'viewer'
    if (!isRole(role)) return c.json({ error: `role must be one of ${ROLES.join(', ')}` }, 400)
    if (role === 'owner' && caller.role !== 'owner') return ownersOnly(c)
    if (await accounts.findByEmail(email)) {
      return c.json({ error: 'That email already has an account.', code: 'already_member' }, 409)
    }
    const { token, invite } = await accounts.createInvite({
      kind: 'invite',
      email,
      role,
      invitedBy: caller.identity,
    })
    await audit.record({
      action: 'invite.created',
      actor: caller.identity,
      target: { type: 'invite', id: invite.id },
      changeDescription: `${email} as ${role}`,
    })
    return c.json(linkResponse(token, invite), 201)
  })

  // A new link for an open invite. The old link stops working.
  app.post('/api/v1/invites/:id/resend', async (c) => {
    const caller = await memberAdmin(c)
    if (caller instanceof Response) return caller
    const { accounts } = caller
    const existing = (await accounts.listInvites()).find(
      (i) => i.id === c.req.param('id') && i.kind === 'invite',
    )
    if (!existing) return c.json({ error: 'Invite not found' }, 404)
    if (existing.role === 'owner' && caller.role !== 'owner') return ownersOnly(c)
    const { token, invite } = await accounts.createInvite({
      kind: 'invite',
      email: existing.email,
      role: existing.role,
      invitedBy: caller.identity,
    })
    await audit.record({
      action: 'invite.created',
      actor: caller.identity,
      target: { type: 'invite', id: invite.id },
      changeDescription: `${existing.email} as ${existing.role}, resent`,
    })
    return c.json(linkResponse(token, invite), 201)
  })

  app.delete('/api/v1/invites/:id', async (c) => {
    const caller = await memberAdmin(c)
    if (caller instanceof Response) return caller
    const { accounts } = caller
    const existing = (await accounts.listInvites()).find((i) => i.id === c.req.param('id'))
    if (!existing) return c.json({ error: 'Invite not found' }, 404)
    if (existing.role === 'owner' && caller.role !== 'owner') return ownersOnly(c)
    await accounts.revokeInvite(existing.id)
    await audit.record({
      action: 'invite.revoked',
      actor: caller.identity,
      target: { type: 'invite', id: existing.id },
      changeDescription: existing.email,
    })
    return c.body(null, 204)
  })

  // ---- Accepting an invite or a reset link (the link itself is the credential) ----

  const linkGone = (c: Context<{ Bindings: Env }>) =>
    c.json(
      {
        error: 'This link has expired or was already used. Ask an admin for a new one.',
        code: 'link_invalid',
      },
      410,
    )

  app.post('/api/v1/invites/inspect', async (c) => {
    const accounts = accountsOf(resolve(c.env))
    if (!accounts) return accountsOff(c)
    const body = await readBody(c)
    if (body instanceof Response) return body
    const invite = typeof body.token === 'string' ? await accounts.findInvite(body.token) : null
    if (!invite) return linkGone(c)
    return c.json({
      kind: invite.kind,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      password: { kdf: PASSWORD_KDF, iterations: PASSWORD_ITERATIONS },
    })
  })

  app.post('/api/v1/invites/accept', async (c) => {
    const accounts = accountsOf(resolve(c.env))
    if (!accounts) return accountsOff(c)
    const body = await readBody(c)
    if (body instanceof Response) return body
    const token = typeof body.token === 'string' ? body.token : ''
    const invite = token ? await accounts.findInvite(token) : null
    if (!invite) return linkGone(c)
    const salt = decodeSalt(body.salt)
    const clientKey = decodeClientKey(body.clientKey)
    if (!salt || !clientKey) return c.json({ error: 'Missing or malformed password key.' }, 400)

    let user: UserRecord | null
    if (invite.kind === 'invite') {
      user = await accounts.createUser({
        email: invite.email,
        name: normalizeName(body.name),
        role: invite.role,
        salt,
        clientKey,
      })
      if (!user) {
        await accounts.consumeInvite(token)
        return c.json(
          { error: 'That email already has an account. Sign in instead.', code: 'already_member' },
          409,
        )
      }
      await audit.record({
        action: 'invite.accepted',
        actor: user.email,
        target: { type: 'user', id: user.id },
        changeDescription: `Joined as ${user.role}`,
      })
    } else {
      const existing = invite.userId ? await accounts.getUser(invite.userId) : null
      if (!existing || existing.email !== invite.email) {
        await accounts.consumeInvite(token)
        return linkGone(c)
      }
      if (existing.status !== 'active') {
        return c.json({ error: 'This account is disabled.', code: 'account_disabled' }, 403)
      }
      await accounts.setPassword(existing, salt, clientKey)
      // A reset is for when a password is lost or leaked, so every existing session ends.
      await accounts.revokeSessionsFor(existing.id)
      await accounts.clearFailures(existing.email)
      user = (await accounts.getUser(existing.id)) ?? existing
      await audit.record({
        action: 'password.changed',
        actor: user.email,
        target: { type: 'user', id: user.id },
        changeDescription: 'With a reset link',
      })
    }
    await accounts.consumeInvite(token)
    await accounts.recordLogin(user)
    const session = await accounts.createSession(user, c.req.header('user-agent'))
    return c.json({
      token: session.token,
      expiresAt: session.session.expiresAt,
      user: publicUser(user),
    })
  })

  registerAdmin('/api/v1')
  registerAdmin('') // legacy unversioned alias — /flags maps to /api/v1/flags

  app.onError((err, c) => {
    console.error('[flaghoist] unhandled error', err)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}
