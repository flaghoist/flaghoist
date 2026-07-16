import type { AttributeValue, StorageAdapter } from '@flaghoist/core'

/** Result of an authentication attempt. `ok: false` carries the status/message to return. */
export interface AuthResult {
  ok: boolean
  /** Caller identity (email/subject/'api-key') recorded in audit metadata when ok. */
  identity?: string
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
   * Inject trusted context attributes derived from headers you control (e.g. a validated
   * session). These override client-supplied context, so security-relevant targeting can be
   * made trustworthy rather than self-asserted.
   */
  trustedContext?: (headers: Headers) => Record<string, AttributeValue>
  /**
   * Prebuilt admin dashboard HTML (a single-file SPA build) to serve at `/admin`. When set, a
   * single deploy gives you the read API, the admin API, and the management UI together.
   */
  dashboard?: string
}

/** Config, or a function that derives it from the runtime environment (e.g. Workers bindings). */
export type ConfigResolver<Env> = ServerConfig | ((env: Env) => ServerConfig)
