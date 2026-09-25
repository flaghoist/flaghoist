import type { FeatureFlag, TargetingRule, WebhookEndpoint, WebhookEvent } from '@flaghoist/core'

export type {
  Condition,
  FeatureFlag,
  FlagMetadata,
  Operator,
  TargetingRule,
  WebhookEndpoint,
  WebhookEvent,
} from '@flaghoist/core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlagInput {
  enabled: boolean
  rollout: { percentage: number }
  rules?: TargetingRule[]
  description?: string
}

export const OPERATORS = [
  'eq',
  'neq',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'endsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'semverGte',
  'semverLt',
] as const

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /**
     * Machine-readable reason from the server's error body, when it sends one. For example
     * `insufficient_role` marks a 403 where the credential was valid but its role was too low,
     * as opposed to a 403 that rejects the credential itself.
     */
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AdminClientOptions {
  url: string
  token: string
  /**
   * Which environment admin requests target, sent as `X-Flaghoist-Environment` on every request.
   * Omit for a server with no environments configured, or to use its default environment.
   */
  environment?: string
  /** Injectable fetch for tests -- drives an in-process server with no network. */
  fetch?: FetchLike
  /** Request timeout in ms. Ignored when `fetch` is injected. Default: 15000. */
  timeoutMs?: number
}

export interface PutOptions {
  ifMatch?: string
  changeDescription?: string
}

export interface ListOptions {
  includeArchived?: boolean
}

export interface ExportPayload {
  version: number
  exportedAt: string
  flags: ExportedFlag[]
}

export interface ExportedFlag {
  key: string
  enabled: boolean
  rollout: { percentage: number }
  description?: string
  rules?: TargetingRule[]
}

export interface ImportResult {
  created: number
  updated: number
  errors: { key: string; error: string }[]
}

export interface WebhookInput {
  url: string
  events?: WebhookEvent[]
  enabled?: boolean
}

export interface WebhookTestResult {
  status: number
  ok: boolean
  error?: string
}

export interface EnvironmentsResult {
  environments: string[]
  default: string
}

/** What a server says about sign-in, before anyone has signed in. */
export interface AuthConfig {
  /** Whether the server has user accounts. False means a shared admin token is the only way in. */
  accounts: boolean
  password?: { kdf: string; iterations: number }
  /** False when the server only allows SSO. */
  passwordSignIn?: boolean
  /** SSO is available, with the name to put on its button. */
  sso?: { label: string } | null
  /** Accounts are on but none exist yet: sign in with the admin token and create the first one. */
  setupRequired?: boolean
}

export interface AccountUser {
  id: string
  email: string
  name: string
  role: string
  status: string
  /** Whether the account has a password. SSO-only accounts do not. */
  hasPassword?: boolean
  /** Whether the account has signed in with SSO. */
  sso?: boolean
  /** `sso` when the identity provider's groups decide the role, so it cannot be changed here. */
  roleManagedBy?: 'sso'
  /** Whether the account uses two-factor codes. */
  twoFactor?: boolean
  /** Roles that differ from `role` in particular environments, for flags there. */
  environmentRoles?: Record<string, string>
  createdAt: string
  lastLoginAt?: string
}

/**
 * The password was right and the account uses two-factor codes: finish with
 * `completeTwoFactor(challenge, code)` within five minutes.
 */
export interface TwoFactorChallenge {
  twoFactorRequired: true
  challenge: string
}

export function isTwoFactorChallenge(value: unknown): value is TwoFactorChallenge {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { twoFactorRequired?: unknown }).twoFactorRequired === true
  )
}

export interface SignInResult {
  /** A session token (`fh_sess_...`), used as the bearer token for `createAdminClient`. */
  token: string
  expiresAt: string
  user: AccountUser
}

/** Who the current credential belongs to. */
export interface Me {
  identity: string
  role: string | null
  accounts: boolean
  /** False when the server only allows SSO sign-in. */
  passwordSignIn?: boolean
  /** The signed-in account. Null for the admin token or any other non-account credential. */
  user: AccountUser | null
  session: { id: string; createdAt: string; expiresAt: string } | null
  /** The personal access token in use, when that is the credential. */
  token?: AccessToken | null
  /** The role this credential has in each configured environment. Null without environments. */
  environmentRoles?: Record<string, string> | null
  /** Two-factor state of the signed-in account. Null without an account. */
  twoFactor?: {
    enabled: boolean
    /** Whether the server's policy makes this account use it. */
    required: boolean
    /** Required but not set up: nothing else works until it is. */
    setupRequired: boolean
  } | null
}

export interface TwoFactorSetup {
  /** The secret, for typing into an app that cannot scan. */
  secret: string
  /** The `otpauth://` link to show as a QR code. */
  uri: string
}

/** A personal access token, as listed. The secret itself is shown only when it is created. */
export interface AccessToken {
  id: string
  name: string
  /** The most the token may do. Its owner's current role caps it further. */
  role: string
  /** The first characters of the token, to tell tokens apart. */
  prefix: string
  createdAt: string
  /** Absent means it never expires. */
  expiresAt?: string
  lastUsedAt?: string
}

export interface NewAccessToken {
  /** The token (`fh_pat_...`). Shown once: the server keeps only a hash. */
  token: string
  info: AccessToken
}

export interface TokenInput {
  name: string
  /** Defaults to the caller's role, and cannot exceed it. */
  role?: string
  /** Days until it expires, 1 to 3650. Defaults to 90. `null` means it never expires. */
  expiresInDays?: number | null
}

export interface AccountSession {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  userAgent?: string
  /** True for the session making this request. */
  current: boolean
}

export interface PasswordChange {
  email: string
  currentPassword: string
  newPassword: string
}

/** A member as the Members page lists them. */
export interface Member extends AccountUser {
  /** When one of their sessions last made a request. Absent when none is live. */
  lastActiveAt?: string
}

/** An open invite, or a link to set a new password. */
export interface Invite {
  id: string
  kind: 'invite' | 'reset'
  email: string
  role: string
  invitedBy: string
  createdAt: string
  expiresAt: string
}

/**
 * A new invite or reset link. `token` is shown once and never again: it goes into the link the
 * person opens (see `inviteLink`).
 */
export interface LinkResult {
  token: string
  invite: Invite
  /** Whether the server emailed the link too. It does only when it has an email sender set up. */
  emailed?: boolean
}

export interface LinkOptions {
  /**
   * The dashboard address to put in an emailed link, when it is not the server's own `/admin`.
   * The server uses it only if its origin is in `allowedOrigins`.
   */
  dashboardUrl?: string
}

/** What a link holder learns before accepting it. */
export interface LinkInfo {
  kind: 'invite' | 'reset'
  email: string
  role: string
  expiresAt: string
}

export interface AuthClient {
  /** The server's sign-in options. A server without accounts, or too old to have them, reports `accounts: false`. */
  config(): Promise<AuthConfig>
  /**
   * Sign in with an email and password. The password is stretched here and never sent. For an
   * account with two-factor codes this returns a challenge instead; see `isTwoFactorChallenge`.
   */
  signIn(email: string, password: string): Promise<SignInResult | TwoFactorChallenge>
  /** Finish a sign-in with the code from an authenticator app, or a recovery code. */
  completeTwoFactor(challenge: string, code: string): Promise<SignInResult>
  /** What an invite or reset link is for. Fails with 410 when it expired or was used. */
  inspectLink(token: string): Promise<LinkInfo>
  /**
   * Accept an invite (creating the account) or a reset link (replacing the password), and sign
   * in. The password is stretched here and never sent.
   */
  acceptLink(
    token: string,
    input: { name?: string; password: string },
  ): Promise<SignInResult | TwoFactorChallenge>
  /**
   * Where to send the browser to sign in with SSO. `returnTo` is the dashboard address to come back
   * to; `browserHash` is `sha256Base64Url(secret)` for a secret this tab keeps until it returns.
   */
  ssoStartUrl(returnTo: string, browserHash: string): string
  /** Trade the code SSO sends back for a session. Only the tab holding the secret can. */
  exchangeSso(code: string, browserSecret: string): Promise<SignInResult>
}

export interface AdminClient {
  list(options?: ListOptions): Promise<FeatureFlag[]>
  get(key: string): Promise<FeatureFlag | null>
  /** `ifMatch` is an ETag from `flagEtag()`. The server rejects with 412 if the flag changed. */
  put(key: string, input: FlagInput, ifMatchOrOptions?: string | PutOptions): Promise<FeatureFlag>
  delete(key: string): Promise<void>
  archive(key: string): Promise<FeatureFlag>
  restore(key: string): Promise<FeatureFlag>
  exportFlags(): Promise<ExportPayload>
  importFlags(payload: ExportPayload): Promise<ImportResult>
  listWebhooks(): Promise<WebhookEndpoint[]>
  createWebhook(input: WebhookInput): Promise<WebhookEndpoint>
  updateWebhook(id: string, input: Partial<WebhookInput>): Promise<WebhookEndpoint>
  deleteWebhook(id: string): Promise<void>
  testWebhook(id: string): Promise<WebhookTestResult>
  /** The server's configured environments and its default. Always returns at least one. */
  listEnvironments(): Promise<EnvironmentsResult>
  /** Who this client's credential belongs to, and with which role. */
  me(): Promise<Me>
  /** End this client's session. A no-op for a credential that is not a session. */
  logout(): Promise<void>
  /** Create the first Owner account. Needs the admin token, and works only while no account exists. */
  createOwner(input: { email: string; name?: string; password: string }): Promise<AccountUser>
  /** Change the signed-in user's password. Signs out their other sessions. */
  changePassword(input: PasswordChange): Promise<{ revokedSessions: number }>
  listSessions(): Promise<AccountSession[]>
  revokeSession(id: string): Promise<void>
  /** Sign out every session of the signed-in user except this one. */
  revokeOtherSessions(): Promise<{ revoked: number }>
  listMembers(): Promise<Member[]>
  /**
   * Change a member's role, name, or status (`disabled` blocks sign-in and ends their sessions).
   * `environmentRoles` replaces their per-environment roles; `null` for an environment removes it.
   */
  updateMember(
    id: string,
    changes: {
      role?: string
      status?: 'active' | 'disabled'
      name?: string
      environmentRoles?: Record<string, string | null>
    },
  ): Promise<AccountUser>
  removeMember(id: string): Promise<void>
  /** A link that lets a member set a new password, valid for 24 hours. */
  createResetLink(id: string, options?: LinkOptions): Promise<LinkResult>
  listInvites(): Promise<Invite[]>
  createInvite(input: { email: string; role: string } & LinkOptions): Promise<LinkResult>
  /** A new link for an open invite. The old one stops working. */
  resendInvite(id: string, options?: LinkOptions): Promise<LinkResult>
  revokeInvite(id: string): Promise<void>
  /** The signed-in user's personal access tokens. */
  listTokens(): Promise<AccessToken[]>
  createToken(input: TokenInput): Promise<NewAccessToken>
  revokeToken(id: string): Promise<void>
  /** Start setting up two-factor codes: a secret to show as a QR code. */
  beginTwoFactor(): Promise<TwoFactorSetup>
  /** Finish setup with a code from the app. Returns ten recovery codes, shown once. */
  confirmTwoFactor(code: string): Promise<string[]>
  /** Replace the recovery codes. Needs a current code. */
  newRecoveryCodes(code: string): Promise<string[]>
  /** Turn two-factor codes off. Needs a current code. */
  disableTwoFactor(code: string): Promise<void>
  /** Turn two-factor off for a member who lost their device. Signs them out everywhere. */
  resetMemberTwoFactor(id: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000

function isFeatureFlag(v: unknown): v is FeatureFlag {
  if (!v || typeof v !== 'object') return false
  const f = v as Record<string, unknown>
  const rollout = f['rollout'] as Record<string, unknown> | undefined
  return (
    typeof f['key'] === 'string' &&
    typeof f['enabled'] === 'boolean' &&
    typeof rollout?.['percentage'] === 'number' &&
    typeof f['metadata'] === 'object' &&
    f['metadata'] !== null
  )
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    throw new ApiError(502, 'The server returned a response that was not valid JSON.')
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown; code?: unknown }
      const detail = body?.error ?? body?.message
      const code = typeof body?.code === 'string' ? body.code : undefined
      if (typeof detail === 'string' && detail.trim()) {
        return new ApiError(res.status, detail.trim(), code)
      }
    } catch {
      /* not JSON -- fall through to raw text */
    }
    return new ApiError(res.status, text.slice(0, 300))
  }
  return new ApiError(res.status, res.statusText || 'Request failed.')
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

type Requester = (
  path: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>

function createRequester(
  url: string,
  headers: Record<string, string>,
  options: { fetch?: FetchLike; timeoutMs?: number },
): Requester {
  const base = url.replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return async (path, init, extraHeaders) => {
    const merged: RequestInit = { ...init, headers: { ...headers, ...extraHeaders } }
    let res: Response
    if (options.fetch) {
      res = await options.fetch(base + path, merged)
    } else {
      try {
        res = await fetch(base + path, { ...merged, signal: AbortSignal.timeout(timeoutMs) })
      } catch (err) {
        if (
          err instanceof DOMException &&
          (err.name === 'TimeoutError' || err.name === 'AbortError')
        ) {
          throw new ApiError(408, `Request timed out after ${Math.round(timeoutMs / 1000)}s.`)
        }
        throw new ApiError(0, 'Could not reach the server. Check the URL and its CORS allowlist.')
      }
    }
    if (!res.ok) throw await toApiError(res)
    return res
  }
}

/** The shortest password the dashboard and CLI accept. No composition rules, per NIST 800-63B. */
export const MIN_PASSWORD_LENGTH = 12

const SALT_BYTES = 16

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * Stretch a password into the key the server stores a keyed hash of: PBKDF2-SHA256 over the
 * NFKC-normalised password, 32 bytes, base64url. Deliberately slow (about 100 ms), and it runs
 * here so the server never handles the password or pays for the hashing.
 */
export async function deriveClientKey(
  password: string,
  salt: string,
  iterations: number,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ApiError(0, 'Password sign-in needs a secure connection (HTTPS or localhost).')
  }
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(salt), iterations },
    material,
    256,
  )
  return toBase64Url(new Uint8Array(bits))
}

function newSalt(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(SALT_BYTES)))
}

interface PasswordParams {
  kdf: string
  iterations: number
  salt: string
}

async function prelogin(request: Requester, email: string): Promise<PasswordParams> {
  const body = (await readJson(
    await request('/api/v1/auth/prelogin', { method: 'POST', body: JSON.stringify({ email }) }),
  )) as Partial<PasswordParams> | null
  if (body?.kdf !== 'pbkdf2-sha256' || typeof body.salt !== 'string' || !body.iterations) {
    throw new ApiError(502, 'Unexpected response: the server asked for an unknown password scheme.')
  }
  return body as PasswordParams
}

async function passwordIterations(request: Requester): Promise<number> {
  const body = (await readJson(await request('/api/v1/auth/config'))) as AuthConfig
  if (!body.password?.iterations) {
    throw new ApiError(404, 'Accounts are not enabled on this server.', 'accounts_disabled')
  }
  return body.password.iterations
}

/**
 * The dashboard link for an invite or reset token: `<dashboard>#accept=<token>`. The token goes in
 * the fragment, which browsers never send to a server or put in a Referer header.
 */
export function inviteLink(dashboardUrl: string, token: string): string {
  return `${dashboardUrl.replace(/#.*$/, '')}#accept=${encodeURIComponent(token)}`
}

/** SHA-256 of a string, base64url encoded: the form `ssoStartUrl` wants the tab secret in. */
export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return toBase64Url(new Uint8Array(digest))
}

/** A fresh random secret for an SSO attempt, kept by the tab that starts it. */
export function newBrowserSecret(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** A client for signing in, which needs no credential. */
export function createAuthClient(
  options: Omit<AdminClientOptions, 'token' | 'environment'>,
): AuthClient {
  const request = createRequester(options.url, { 'content-type': 'application/json' }, options)
  return {
    async config() {
      try {
        const body = (await readJson(await request('/api/v1/auth/config'))) as AuthConfig
        return body && typeof body.accounts === 'boolean' ? body : { accounts: false }
      } catch (err) {
        // A server from before accounts has no such route.
        if (err instanceof ApiError && err.status === 404) return { accounts: false }
        throw err
      }
    },

    async signIn(email, password) {
      const params = await prelogin(request, email)
      const clientKey = await deriveClientKey(password, params.salt, params.iterations)
      const body = await readJson(
        await request('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, clientKey }),
        }),
      )
      return body as SignInResult | TwoFactorChallenge
    },

    async completeTwoFactor(challenge, code) {
      return (await readJson(
        await request('/api/v1/auth/login/two-factor', {
          method: 'POST',
          body: JSON.stringify({ challenge, code }),
        }),
      )) as SignInResult
    },

    async inspectLink(token) {
      return (await readJson(
        await request('/api/v1/invites/inspect', {
          method: 'POST',
          body: JSON.stringify({ token }),
        }),
      )) as LinkInfo & { password: { iterations: number } }
    },

    async acceptLink(token, input) {
      const info = (await readJson(
        await request('/api/v1/invites/inspect', {
          method: 'POST',
          body: JSON.stringify({ token }),
        }),
      )) as { password?: { iterations?: number } }
      const iterations = info.password?.iterations
      if (!iterations) throw new ApiError(502, 'Unexpected response: no password parameters.')
      const salt = newSalt()
      const clientKey = await deriveClientKey(input.password, salt, iterations)
      return (await readJson(
        await request('/api/v1/invites/accept', {
          method: 'POST',
          body: JSON.stringify({ token, name: input.name, salt, clientKey }),
        }),
      )) as SignInResult | TwoFactorChallenge
    },

    ssoStartUrl(returnTo, browserHash) {
      const base = options.url.replace(/\/+$/, '')
      return `${base}/api/v1/auth/sso/start?return=${encodeURIComponent(returnTo)}&browser=${browserHash}`
    },

    async exchangeSso(code, browserSecret) {
      return (await readJson(
        await request('/api/v1/auth/sso/exchange', {
          method: 'POST',
          body: JSON.stringify({ code, browserSecret }),
        }),
      )) as SignInResult
    },
  }
}

export function createAdminClient(options: AdminClientOptions): AdminClient {
  const baseHeaders: Record<string, string> = {
    authorization: `Bearer ${options.token}`,
    'content-type': 'application/json',
  }
  if (options.environment) {
    baseHeaders['x-flaghoist-environment'] = options.environment
  }
  const request = createRequester(options.url, baseHeaders, options)

  return {
    async list(options) {
      const qs = options?.includeArchived ? '?includeArchived=true' : ''
      const body = await readJson(await request(`/api/v1/flags${qs}`))
      const flags = (body as { flags?: unknown } | null)?.flags
      if (!Array.isArray(flags)) {
        throw new ApiError(502, 'Unexpected response: the flag list was missing or malformed.')
      }
      return flags.filter(isFeatureFlag)
    },

    async get(key) {
      try {
        const res = await request(`/api/v1/flags/${encodeURIComponent(key)}`)
        const body = await readJson(res)
        return isFeatureFlag(body) ? body : null
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },

    async put(key, input, ifMatchOrOptions) {
      const opts: PutOptions =
        typeof ifMatchOrOptions === 'string'
          ? { ifMatch: ifMatchOrOptions }
          : (ifMatchOrOptions ?? {})
      const extra = opts.ifMatch ? { 'if-match': opts.ifMatch } : undefined
      const payload = opts.changeDescription
        ? { ...input, changeDescription: opts.changeDescription }
        : input
      const body = await readJson(
        await request(
          `/api/v1/flags/${encodeURIComponent(key)}`,
          { method: 'PUT', body: JSON.stringify(payload) },
          extra,
        ),
      )
      if (!isFeatureFlag(body)) {
        throw new ApiError(502, 'Unexpected response: the saved flag was malformed.')
      }
      return body
    },

    async delete(key) {
      await request(`/api/v1/flags/${encodeURIComponent(key)}`, { method: 'DELETE' })
    },

    async archive(key) {
      const body = await readJson(
        await request(`/api/v1/flags/${encodeURIComponent(key)}/archive`, { method: 'POST' }),
      )
      if (!isFeatureFlag(body)) {
        throw new ApiError(502, 'Unexpected response: the archived flag was malformed.')
      }
      return body
    },

    async restore(key) {
      const body = await readJson(
        await request(`/api/v1/flags/${encodeURIComponent(key)}/restore`, { method: 'POST' }),
      )
      if (!isFeatureFlag(body)) {
        throw new ApiError(502, 'Unexpected response: the restored flag was malformed.')
      }
      return body
    },

    async exportFlags() {
      const body = await readJson(await request('/api/v1/export'))
      return body as ExportPayload
    },

    async importFlags(payload) {
      const body = await readJson(
        await request('/api/v1/import', {
          method: 'POST',
          body: JSON.stringify({ version: payload.version, flags: payload.flags }),
        }),
      )
      return body as ImportResult
    },

    async listWebhooks() {
      const body = await readJson(await request('/api/v1/webhooks'))
      const hooks = (body as { webhooks?: unknown } | null)?.webhooks
      if (!Array.isArray(hooks)) {
        throw new ApiError(502, 'Unexpected response: the webhook list was missing or malformed.')
      }
      return hooks as WebhookEndpoint[]
    },

    async createWebhook(input) {
      const body = await readJson(
        await request('/api/v1/webhooks', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      )
      return body as WebhookEndpoint
    },

    async updateWebhook(id, input) {
      const body = await readJson(
        await request(`/api/v1/webhooks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(input),
        }),
      )
      return body as WebhookEndpoint
    },

    async deleteWebhook(id) {
      await request(`/api/v1/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async testWebhook(id) {
      const body = await readJson(
        await request(`/api/v1/webhooks/${encodeURIComponent(id)}/test`, { method: 'POST' }),
      )
      return body as WebhookTestResult
    },

    async listEnvironments() {
      const body = await readJson(await request('/api/v1/environments'))
      return body as EnvironmentsResult
    },

    async me() {
      return (await readJson(await request('/api/v1/auth/me'))) as Me
    },

    async logout() {
      await request('/api/v1/auth/logout', { method: 'POST' })
    },

    async createOwner(input) {
      const iterations = await passwordIterations(request)
      const salt = newSalt()
      const clientKey = await deriveClientKey(input.password, salt, iterations)
      const body = (await readJson(
        await request('/api/v1/auth/setup', {
          method: 'POST',
          body: JSON.stringify({ email: input.email, name: input.name, salt, clientKey }),
        }),
      )) as { user: AccountUser }
      return body.user
    },

    async changePassword(input) {
      const current = await prelogin(request, input.email)
      const salt = newSalt()
      const [currentClientKey, clientKey] = await Promise.all([
        deriveClientKey(input.currentPassword, current.salt, current.iterations),
        deriveClientKey(input.newPassword, salt, current.iterations),
      ])
      const body = await readJson(
        await request('/api/v1/me/password', {
          method: 'PUT',
          body: JSON.stringify({ currentClientKey, salt, clientKey }),
        }),
      )
      return body as { revokedSessions: number }
    },

    async listSessions() {
      const body = (await readJson(await request('/api/v1/me/sessions'))) as {
        sessions: AccountSession[]
      }
      return body.sessions
    },

    async revokeSession(id) {
      await request(`/api/v1/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async revokeOtherSessions() {
      return (await readJson(await request('/api/v1/me/sessions', { method: 'DELETE' }))) as {
        revoked: number
      }
    },

    async listMembers() {
      const body = (await readJson(await request('/api/v1/users'))) as { users: Member[] }
      return body.users
    },

    async updateMember(id, changes) {
      return (await readJson(
        await request(`/api/v1/users/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(changes),
        }),
      )) as AccountUser
    },

    async removeMember(id) {
      await request(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async createResetLink(id, options) {
      return (await readJson(
        await request(`/api/v1/users/${encodeURIComponent(id)}/reset`, {
          method: 'POST',
          body: JSON.stringify(options ?? {}),
        }),
      )) as LinkResult
    },

    async listInvites() {
      const body = (await readJson(await request('/api/v1/invites'))) as { invites: Invite[] }
      return body.invites
    },

    async createInvite(input) {
      return (await readJson(
        await request('/api/v1/invites', { method: 'POST', body: JSON.stringify(input) }),
      )) as LinkResult
    },

    async resendInvite(id, options) {
      return (await readJson(
        await request(`/api/v1/invites/${encodeURIComponent(id)}/resend`, {
          method: 'POST',
          body: JSON.stringify(options ?? {}),
        }),
      )) as LinkResult
    },

    async revokeInvite(id) {
      await request(`/api/v1/invites/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async listTokens() {
      const body = (await readJson(await request('/api/v1/tokens'))) as { tokens: AccessToken[] }
      return body.tokens
    },

    async createToken(input) {
      return (await readJson(
        await request('/api/v1/tokens', { method: 'POST', body: JSON.stringify(input) }),
      )) as NewAccessToken
    },

    async revokeToken(id) {
      await request(`/api/v1/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async beginTwoFactor() {
      return (await readJson(
        await request('/api/v1/me/two-factor/setup', { method: 'POST' }),
      )) as TwoFactorSetup
    },

    async confirmTwoFactor(code) {
      const body = (await readJson(
        await request('/api/v1/me/two-factor/confirm', {
          method: 'POST',
          body: JSON.stringify({ code }),
        }),
      )) as { recoveryCodes: string[] }
      return body.recoveryCodes
    },

    async newRecoveryCodes(code) {
      const body = (await readJson(
        await request('/api/v1/me/two-factor/recovery-codes', {
          method: 'POST',
          body: JSON.stringify({ code }),
        }),
      )) as { recoveryCodes: string[] }
      return body.recoveryCodes
    },

    async disableTwoFactor(code) {
      await request('/api/v1/me/two-factor', { method: 'DELETE', body: JSON.stringify({ code }) })
    },

    async resetMemberTwoFactor(id) {
      await request(`/api/v1/users/${encodeURIComponent(id)}/two-factor`, { method: 'DELETE' })
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ETag for a flag, for use with the `ifMatch` parameter of `put()`. */
export function flagEtag(flag: FeatureFlag): string {
  return `"${flag.metadata.updatedAt}"`
}

/** Human-readable enabled state of a flag. */
export function flagState(flag: FeatureFlag): {
  label: string
  kind: 'on' | 'off' | 'split' | 'disabled'
} {
  if (!flag.enabled) return { label: 'disabled', kind: 'disabled' }
  const pct = flag.rollout.percentage
  if (pct >= 100) return { label: 'on', kind: 'on' }
  if (pct <= 0) return { label: 'off', kind: 'off' }
  return { label: `${pct}%`, kind: 'split' }
}

function requireFlag(flag: FeatureFlag | null, key: string): FeatureFlag {
  if (!flag) throw new Error(`Flag "${key}" not found`)
  return flag
}

export function createFlag(
  client: AdminClient,
  key: string,
  opts: { enabled?: boolean; percentage?: number; description?: string },
): Promise<FeatureFlag> {
  return client.put(key, {
    enabled: opts.enabled ?? false,
    rollout: { percentage: opts.percentage ?? 0 },
    rules: [],
    description: opts.description ?? '',
  })
}

export async function toggleFlag(
  client: AdminClient,
  key: string,
  to: boolean | 'flip',
): Promise<FeatureFlag> {
  const flag = requireFlag(await client.get(key), key)
  const enabled = to === 'flip' ? !flag.enabled : to
  return client.put(key, {
    enabled,
    rollout: flag.rollout,
    rules: flag.rules,
    description: flag.description,
  })
}

export async function setRollout(
  client: AdminClient,
  key: string,
  percentage: number,
): Promise<FeatureFlag> {
  const flag = requireFlag(await client.get(key), key)
  return client.put(key, {
    enabled: flag.enabled,
    rollout: { percentage },
    rules: flag.rules,
    description: flag.description,
  })
}

export async function setRules(
  client: AdminClient,
  key: string,
  rules: TargetingRule[],
): Promise<FeatureFlag> {
  const flag = requireFlag(await client.get(key), key)
  return client.put(key, {
    enabled: flag.enabled,
    rollout: flag.rollout,
    rules,
    description: flag.description,
  })
}
