import type { AttributeValue, StorageAdapter } from '@flaghoist/core'
import type { Role } from './permissions'
import type { RateLimit } from './ratelimit'

/** Result of an authentication attempt. `ok: false` carries the status/message to return. */
export interface AuthResult {
  ok: boolean
  /** Caller identity (email/subject/'api-key') recorded in audit metadata when ok. */
  identity?: string
  /**
   * The environment this credential is scoped to, when the read verifier is environment-aware
   * (see `apiKeys()` in auth.ts). Absent means "not environment-specific": the request maps to
   * the server's default environment.
   */
  environment?: string
  /**
   * The caller's admin role, on the admin path. Absent means `owner`, which is exactly the access
   * every admin verifier granted before roles existed, so existing verifiers keep working
   * unchanged. A value that is not a known role grants nothing.
   */
  role?: Role
  /** HTTP status to return when not ok. */
  status?: 401 | 403
  /** Public, non-sensitive error message when not ok. */
  message?: string
}

/**
 * Authenticates a request from its headers. Verifiers extract whatever credential they need
 * (an API key header, a bearer token, …) and never throw for an ordinary auth failure.
 */
export type Authenticator = (headers: Headers) => Promise<AuthResult> | AuthResult

export interface ServerConfig {
  /** Storage backend (any StorageAdapter — Cloudflare KV, memory, or your own). */
  storage: StorageAdapter
  auth: {
    /** Guards the admin/write path (create/update/delete + full flag reads). */
    admin: Authenticator
    /** Guards the OFREP read/evaluate path. */
    read: Authenticator
  }
  /** Exact-match CORS origin allowlist. Omit for same-origin only (no CORS headers emitted). */
  allowedOrigins?: string[]
  /** TTL in seconds for the in-isolate flag-definition cache on the read path. Default: 30. */
  cacheTtlSeconds?: number
  /**
   * Optional rate limiter, applied to every route except `/health`. Off by default. On a single
   * process the built-in `memoryRateLimit` is effective; on Cloudflare it is per-isolate, so prefer
   * Cloudflare's own Rate Limiting there. See `packages/server/src/ratelimit.ts`.
   */
  rateLimit?: RateLimit
  /**
   * Inject trusted context attributes derived from headers you control (e.g. a validated
   * session). These override client-supplied context, so security-relevant targeting can be
   * made trustworthy rather than self-asserted.
   */
  trustedContext?: (headers: Headers) => Record<string, AttributeValue>
  /**
   * Prebuilt admin dashboard HTML (a single-file SPA build) to serve at `/admin`. When set, a
   * single deploy gives you the read API, the admin API, and the management UI together. Omit it
   * (or set `dashboard = false` in flaghoist.toml) to run the APIs without the UI.
   */
  dashboard?: string
  /**
   * Serve the OpenAPI 3.1 document at `/api/v1/openapi.json`. On by default. It is unauthenticated
   * and describes every route and auth scheme, so a locked-down deployment that does not need it can
   * set this to `false` and stop advertising its own API surface.
   */
  exposeOpenApi?: boolean
  /**
   * Named environments this deployment serves (e.g. `['production', 'staging', 'development']`).
   * When set, flags are partitioned per environment: the same key can be on in staging and off in
   * production, each with its own audit trail. Admin requests choose one with the
   * `X-Flaghoist-Environment` header (defaulting to `defaultEnvironment` when omitted); the read
   * (OFREP) path is scoped by whichever environment the read credential maps to (see `apiKeys()`).
   *
   * Omit entirely to run with a single, unnamed environment exactly as before. No migration
   * needed, and existing flags are unaffected.
   */
  environments?: string[]
  /**
   * Which configured environment is the default: it uses bare storage keys and never stamps
   * `environment` on a flag, so flags created before environments existed are already in it with
   * zero migration. Default: `'production'`.
   */
  defaultEnvironment?: string
}

/** Config, or a function that derives it from the runtime environment (e.g. Workers bindings). */
export type ConfigResolver<Env> = ServerConfig | ((env: Env) => ServerConfig)
