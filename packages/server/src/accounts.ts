import type { StorageAdapter } from '@flaghoist/core'
import { isRole, lowerRole, type Role } from './permissions'
import { seal, unseal } from './sealed'
import { assertSsoConfig, type SsoConfig } from './sso'
import {
  looksLikeRecoveryCode,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  normalizeRecoveryCode,
} from './totp'

/**
 * User accounts, password sign-in and server sessions. Everything here is stored through the
 * adapter's generic record store, so accounts live in whatever storage the deployment already uses.
 *
 * Passwords never reach the server. The client stretches the password with PBKDF2 and sends the
 * result (the "client key"); the server keys that with a secret pepper and stores only the HMAC.
 * The slow hash therefore costs the client about 100 ms once per sign-in, and the server two HMACs,
 * which keeps sign-in inside the 10 ms CPU budget of the Cloudflare Workers free plan.
 */

export interface UsersConfig {
  /**
   * Server secret that keys every stored password verifier, at least 32 characters (for example
   * `openssl rand -hex 32`). Keep it out of the storage backend and back it up: a database leak
   * without the pepper reveals nothing useful, but losing the pepper invalidates every password.
   */
  pepper: string
  /** A short label stored with each verifier, so the pepper can be rotated later. Default `p1`. */
  pepperId?: string
  session?: {
    /** Sign a session out after this many minutes without a request. Default 30. */
    idleMinutes?: number
    /** Sign a session out this many hours after sign-in, active or not. Default 12. */
    maxHours?: number
  }
  invites?: {
    /** How long an invite link stays valid. Default 7 days. Password reset links last 24 hours. */
    expiresInDays?: number
  }
  /** Sign in with an OpenID Connect provider as well as, or instead of, a password. */
  sso?: SsoConfig
  /**
   * Who must use a two-factor code with their password: `optional` (the default), `admins` (admins
   * and owners) or `everyone`. Someone who must but has not set it up is asked to at their next
   * sign-in and can do nothing else until they have. SSO sign-ins are exempt; the identity
   * provider's own two-factor covers them.
   */
  twoFactor?: 'optional' | 'admins' | 'everyone'
}

export const PASSWORD_KDF = 'pbkdf2-sha256'
export const PASSWORD_ITERATIONS = 600_000
export const SESSION_PREFIX = 'fh_sess_'
export const INVITE_PREFIX = 'fh_inv_'
export const RESET_PREFIX = 'fh_rst_'
export const TOKEN_PREFIX = 'fh_pat_'
export const DEFAULT_TOKEN_DAYS = 90
export const MAX_TOKEN_DAYS = 3650
const RESET_LINK_MS = 24 * 3_600_000
const SALT_BYTES = 16
const CLIENT_KEY_BYTES = 32
const MIN_PEPPER_LENGTH = 32
const MAX_EMAIL_LENGTH = 254
const MAX_NAME_LENGTH = 100
const MAX_USER_AGENT_LENGTH = 200

const USERS = 'users'
const USERS_BY_EMAIL = 'users-email'
const SESSIONS = 'sessions'
const LOGIN_ATTEMPTS = 'login-attempts'
const INVITES = 'invites'
const TOKENS = 'tokens'
const USERS_BY_SSO = 'users-sso'

// Read in place of a user record when an email has no account, so a failed sign-in for an unknown
// email makes the same storage round trips as one for a real account.
const ABSENT_USER_ID = 'usr_absent'

export type UserStatus = 'active' | 'disabled'

export interface PasswordVerifier {
  kdf: typeof PASSWORD_KDF
  iterations: number
  salt: string
  verifier: string
  pepperId: string
}

export interface UserRecord {
  id: string
  email: string
  name: string
  role: Role
  status: UserStatus
  password?: PasswordVerifier
  /** The provider identity this account signs in with, once it has used SSO. */
  sso?: { issuer: string; subject: string }
  /** Set when the SSO provider's groups decide this account's role. */
  roleManagedBy?: 'sso'
  /**
   * A different role in some environments, such as editor in staging for a viewer. Applies to that
   * environment's flags only. Owners have none: they have full access everywhere.
   */
  environmentRoles?: Record<string, Role>
  /** Two-factor codes, once set up. The secret is sealed: the server must read it, not just match it. */
  twoFactor?: {
    secret: string
    enabledAt: string
    /** The last time step a code was accepted for, so no code works twice. */
    lastStep?: number
    /** SHA-256 hashes of the unused recovery codes. */
    recoveryCodes: string[]
  }
  /** A secret shown for setup and not yet confirmed with a code. Sealed, like the live one. */
  pendingTwoFactor?: { secret: string; createdAt: string }
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
}

/** What the API returns for a user: never the verifier. */
export interface PublicUser {
  id: string
  email: string
  name: string
  role: Role
  status: UserStatus
  /** Whether the account has a password. SSO-only accounts do not. */
  hasPassword: boolean
  /** Whether the account has signed in with SSO. */
  sso?: boolean
  /** Set when the SSO provider decides the role, so it cannot be changed here. */
  roleManagedBy?: 'sso'
  /** Whether the account uses two-factor codes. */
  twoFactor: boolean
  /** Roles that differ from `role` in particular environments. */
  environmentRoles?: Record<string, Role>
  createdAt: string
  lastLoginAt?: string
}

export interface SessionRecord {
  /** Public id, safe to show and to revoke by. The record itself is keyed by the token's hash. */
  id: string
  userId: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  userAgent?: string
  /** How the session was signed in, when it was not with a password. */
  via?: 'sso'
}

/** An invite to join, or a link to set a new password. Stored under the hash of its token. */
export interface InviteRecord {
  id: string
  kind: 'invite' | 'reset'
  email: string
  role: Role
  /** The account a reset link is for. Absent on invites, whose account does not exist yet. */
  userId?: string
  invitedBy: string
  createdAt: string
  expiresAt: string
}

export type PublicInvite = Omit<InviteRecord, 'userId'>

/** A personal access token. Stored under the hash of the token itself. */
export interface TokenRecord {
  id: string
  userId: string
  name: string
  /** The most this token may do. Its owner's current role caps it further on every request. */
  role: Role
  /** The first characters of the token, so people can tell their tokens apart. */
  prefix: string
  createdAt: string
  /** Absent means the token never expires. */
  expiresAt?: string
  lastUsedAt?: string
}

export type PublicToken = Omit<TokenRecord, 'userId'>

export function publicToken(token: TokenRecord): PublicToken {
  const { userId: _, ...rest } = token
  return rest
}

export interface ResolvedToken {
  user: UserRecord
  token: TokenRecord
  /** The lower of the token's role and its owner's current role. */
  role: Role
}

export interface PublicSession {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  userAgent?: string
  current: boolean
}

interface AttemptRecord {
  failures: number
  windowStart: number
  lockedUntil?: number
}

type RecordStore = Required<
  Pick<StorageAdapter, 'getRecord' | 'putRecord' | 'deleteRecord' | 'listRecords'>
>

// ---------------------------------------------------------------------------
// Config checks
// ---------------------------------------------------------------------------

function hasRecordStore(storage: StorageAdapter): boolean {
  return (
    typeof storage.getRecord === 'function' &&
    typeof storage.putRecord === 'function' &&
    typeof storage.deleteRecord === 'function' &&
    typeof storage.listRecords === 'function'
  )
}

/**
 * Throw when `users` is configured in a way that cannot work. Accounts must never fall back to
 * memory the way webhooks do: every account would vanish on the next restart or deploy.
 */
export function assertUsersConfig(users: UsersConfig, storage: StorageAdapter): void {
  if (!hasRecordStore(storage)) {
    throw new Error(
      '[flaghoist] `users` needs a storage adapter with the record store (getRecord, putRecord, ' +
        'deleteRecord, listRecords). Every bundled adapter has it; a custom adapter must add it, ' +
        'since accounts cannot be kept in memory.',
    )
  }
  if (typeof users.pepper !== 'string' || users.pepper.length < MIN_PEPPER_LENGTH) {
    throw new Error(
      `[flaghoist] \`users.pepper\` must be at least ${MIN_PEPPER_LENGTH} characters. ` +
        'Generate one with `openssl rand -hex 32` and keep it in a secret, not in code.',
    )
  }
  if (users.sso) assertSsoConfig(users.sso)
}

// ---------------------------------------------------------------------------
// Encoding and crypto helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length)
  crypto.getRandomValues(out)
  return out
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))))
}

const pepperKeys = new Map<string, Promise<CryptoKey>>()

function pepperKey(pepper: string): Promise<CryptoKey> {
  let key = pepperKeys.get(pepper)
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(pepper),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    pepperKeys.set(pepper, key)
  }
  return key
}

async function hmac(pepper: string, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await pepperKey(pepper), data))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number)
  return diff === 0
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length < 3 || encoder.encode(email).length > MAX_EMAIL_LENGTH) return null
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null
  return email
}

export function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : ''
}

/** A client key or salt, decoded, when it has exactly the expected length. */
export function decodeFixed(value: unknown, bytes: number): Uint8Array<ArrayBuffer> | null {
  if (typeof value !== 'string') return null
  const decoded = fromBase64Url(value)
  return decoded && decoded.length === bytes ? decoded : null
}

export const decodeClientKey = (value: unknown) => decodeFixed(value, CLIENT_KEY_BYTES)
export const decodeSalt = (value: unknown) => decodeFixed(value, SALT_BYTES)

// ---------------------------------------------------------------------------
// The account store
// ---------------------------------------------------------------------------

export interface PasswordParams {
  kdf: typeof PASSWORD_KDF
  iterations: number
  salt: string
}

export interface ResolvedSession {
  user: UserRecord
  session: SessionRecord
}

export type ThrottleResult = { ok: true } | { ok: false; retryAfterSeconds: number }

// Throttling: an email gets five free failures in fifteen minutes, then locks for 30 s, doubling per
// further failure up to fifteen minutes. An IP address locks for fifteen minutes after thirty
// failures across any emails. Counters live in the record store, not in memory, because a
// Cloudflare deployment runs many isolates that would each keep their own count.
const ATTEMPT_WINDOW_MS = 15 * 60_000
const EMAIL_FREE_FAILURES = 5
const EMAIL_BASE_LOCK_MS = 30_000
const MAX_LOCK_MS = 15 * 60_000
const IP_MAX_FAILURES = 30

/** A member's role in one environment: their override there, or their main role. */
export function roleInEnvironment(user: UserRecord, environment: string): Role {
  if (user.role === 'owner') return 'owner'
  return user.environmentRoles?.[environment] ?? user.role
}

export function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    hasPassword: user.password !== undefined,
    twoFactor: user.twoFactor !== undefined,
    ...(user.environmentRoles && Object.keys(user.environmentRoles).length > 0
      ? { environmentRoles: user.environmentRoles }
      : {}),
    ...(user.sso ? { sso: true } : {}),
    ...(user.roleManagedBy ? { roleManagedBy: user.roleManagedBy } : {}),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
  }
}

function isUserRecord(value: unknown): value is UserRecord {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.email === 'string' &&
    isRole(v.role) &&
    (v.status === 'active' || v.status === 'disabled')
  )
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.userId === 'string' &&
    typeof v.lastSeenAt === 'string' &&
    typeof v.expiresAt === 'string'
  )
}

function isInviteRecord(value: unknown): value is InviteRecord {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    (v.kind === 'invite' || v.kind === 'reset') &&
    typeof v.email === 'string' &&
    isRole(v.role) &&
    typeof v.expiresAt === 'string'
  )
}

export function publicInvite(invite: InviteRecord): PublicInvite {
  const { userId: _, ...rest } = invite
  return rest
}

function isTokenRecord(value: unknown): value is TokenRecord {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.userId === 'string' &&
    typeof v.name === 'string' &&
    isRole(v.role)
  )
}

function isAttemptRecord(value: unknown): value is AttemptRecord {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.failures === 'number' && typeof v.windowStart === 'number'
}

export function createAccountStore(storage: StorageAdapter, users: UsersConfig) {
  const records = storage as StorageAdapter & RecordStore
  const pepper = users.pepper
  const pepperId = users.pepperId ?? 'p1'
  const idleMs = (users.session?.idleMinutes ?? 30) * 60_000
  const maxMs = (users.session?.maxHours ?? 12) * 3_600_000
  // How stale lastSeenAt may get before a request writes it back. Writing on every request would
  // burn through Cloudflare KV's write quota, so the idle timeout is enforced to within this much.
  const touchMs = Math.min(5 * 60_000, idleMs / 6)
  const inviteMs = (users.invites?.expiresInDays ?? 7) * 86_400_000

  async function liveInvites(): Promise<{ key: string; invite: InviteRecord }[]> {
    const now = Date.now()
    const out: { key: string; invite: InviteRecord }[] = []
    for (const { id, value } of await records.listRecords(INVITES)) {
      if (!isInviteRecord(value)) continue
      if (now >= Date.parse(value.expiresAt)) await records.deleteRecord(INVITES, id)
      else out.push({ key: id, invite: value })
    }
    return out
  }

  // Keyed by a hash: an issuer URL and subject together can outgrow a record id.
  const ssoKey = (issuer: string, subject: string) => sha256Hex(`${issuer}\n${subject}`)

  // The two-factor secret must be read back to compute codes, so it is sealed rather than hashed.
  const sealSecret = (secret: string) =>
    seal(pepper, 'totp-secret', { exp: Number.MAX_SAFE_INTEGER, secret })
  const openSecret = async (sealed: string) =>
    (await unseal<{ exp: number; secret: string }>(pepper, 'totp-secret', sealed))?.secret ?? null
  const hashRecoveryCode = (code: string) => sha256Hex(`recovery:${normalizeRecoveryCode(code)}`)

  async function tokensOf(userId: string): Promise<{ key: string; token: TokenRecord }[]> {
    return (await records.listRecords(TOKENS))
      .filter((r): r is { id: string; value: TokenRecord } => isTokenRecord(r.value))
      .filter((r) => r.value.userId === userId)
      .map((r) => ({ key: r.id, token: r.value }))
  }

  async function allSessions(): Promise<{ key: string; session: SessionRecord }[]> {
    const now = Date.now()
    const out: { key: string; session: SessionRecord }[] = []
    for (const { id, value } of await records.listRecords(SESSIONS)) {
      if (!isSessionRecord(value)) continue
      const expired =
        now >= Date.parse(value.expiresAt) || now - Date.parse(value.lastSeenAt) >= idleMs
      if (expired) await records.deleteRecord(SESSIONS, id)
      else out.push({ key: id, session: value })
    }
    return out
  }

  async function getUser(id: string): Promise<UserRecord | null> {
    const value = await records.getRecord(USERS, id)
    return isUserRecord(value) ? value : null
  }

  async function userIdForEmail(email: string): Promise<string | null> {
    const value = (await records.getRecord(USERS_BY_EMAIL, email)) as { userId?: unknown } | null
    return typeof value?.userId === 'string' ? value.userId : null
  }

  /** The user for an email, doing the same storage work whether or not the account exists. */
  async function findByEmail(email: string): Promise<UserRecord | null> {
    const id = await userIdForEmail(email)
    const user = await getUser(id ?? ABSENT_USER_ID)
    return id && user && user.email === email ? user : null
  }

  async function fakeSalt(email: string): Promise<string> {
    return toBase64Url((await hmac(pepper, encoder.encode(`salt:${email}`))).slice(0, SALT_BYTES))
  }

  async function makeVerifier(
    salt: Uint8Array,
    clientKey: Uint8Array<ArrayBuffer>,
  ): Promise<PasswordVerifier> {
    return {
      kdf: PASSWORD_KDF,
      iterations: PASSWORD_ITERATIONS,
      salt: toBase64Url(salt),
      verifier: toBase64Url(await hmac(pepper, clientKey)),
      pepperId,
    }
  }

  /** Compare a client key with a user's verifier, or with a dummy one when there is no user. */
  async function checkPassword(
    user: UserRecord | null,
    clientKey: Uint8Array<ArrayBuffer>,
  ): Promise<boolean> {
    // Both HMACs run every time, so a known email costs exactly what an unknown one does.
    const [computed, dummy] = await Promise.all([
      hmac(pepper, clientKey),
      hmac(pepper, encoder.encode('absent')),
    ])
    const stored = user?.password ? fromBase64Url(user.password.verifier) : null
    const expected = stored ?? dummy
    const match = constantTimeEqual(computed, expected)
    return match && stored !== null && user?.status === 'active'
  }

  async function readAttempt(id: string): Promise<AttemptRecord | null> {
    const value = await records.getRecord(LOGIN_ATTEMPTS, id)
    return isAttemptRecord(value) ? value : null
  }

  function attemptIds(email: string, ip: string): [string, string] {
    return [`email:${email}`, `ip:${ip.slice(0, 64)}`]
  }

  return {
    async count(): Promise<number> {
      return (await records.listRecords(USERS)).length
    },

    getUser,
    findByEmail,

    async listUsers(): Promise<UserRecord[]> {
      return (await records.listRecords(USERS))
        .map((r) => r.value)
        .filter(isUserRecord)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },

    async saveUser(user: UserRecord): Promise<UserRecord> {
      const updated = { ...user, updatedAt: new Date().toISOString() }
      await records.putRecord(USERS, user.id, updated)
      return updated
    },

    /** Delete an account with its email index, sessions and any open reset link. */
    async removeUser(user: UserRecord): Promise<void> {
      await Promise.all([
        ...(await allSessions())
          .filter((s) => s.session.userId === user.id)
          .map((s) => records.deleteRecord(SESSIONS, s.key)),
        ...(await liveInvites())
          .filter((i) => i.invite.userId === user.id)
          .map((i) => records.deleteRecord(INVITES, i.key)),
        ...(await tokensOf(user.id)).map((t) => records.deleteRecord(TOKENS, t.key)),
        ...(user.sso
          ? [
              ssoKey(user.sso.issuer, user.sso.subject).then((k) =>
                records.deleteRecord(USERS_BY_SSO, k),
              ),
            ]
          : []),
      ])
      await records.deleteRecord(USERS_BY_EMAIL, user.email)
      await records.deleteRecord(USERS, user.id)
    },

    /** When each user was last seen, from their live sessions. */
    async lastActive(): Promise<Map<string, string>> {
      const out = new Map<string, string>()
      for (const { session } of await allSessions()) {
        const prev = out.get(session.userId)
        if (!prev || session.lastSeenAt > prev) out.set(session.userId, session.lastSeenAt)
      }
      return out
    },

    /** Sign out every session of a user, except `keepId`. Returns how many ended. */
    async revokeSessionsFor(userId: string, keepId?: string): Promise<number> {
      const ended = (await allSessions()).filter(
        (s) => s.session.userId === userId && s.session.id !== keepId,
      )
      await Promise.all(ended.map((s) => records.deleteRecord(SESSIONS, s.key)))
      return ended.length
    },

    // ---- two-factor codes ----

    /** Whether the policy makes this account use two-factor codes with its password. */
    twoFactorRequired(user: UserRecord): boolean {
      const policy = users.twoFactor ?? 'optional'
      if (policy === 'everyone') return true
      return policy === 'admins' && (user.role === 'admin' || user.role === 'owner')
    },

    /** Start setup: a fresh secret, kept sealed on the account until a code confirms it. */
    async beginTwoFactor(user: UserRecord): Promise<string> {
      const secret = newTotpSecret()
      await records.putRecord(USERS, user.id, {
        ...user,
        pendingTwoFactor: {
          secret: await sealSecret(secret),
          createdAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      } satisfies UserRecord)
      return secret
    },

    /** Finish setup with a code from the app. Returns the recovery codes, or null for a wrong code. */
    async confirmTwoFactor(user: UserRecord, code: string): Promise<string[] | null> {
      if (!user.pendingTwoFactor) return null
      const secret = await openSecret(user.pendingTwoFactor.secret)
      if (!secret) return null
      const step = await matchTotp(secret, code)
      if (step === null) return null
      const codes = newRecoveryCodes()
      const { pendingTwoFactor: _, ...rest } = user
      await records.putRecord(USERS, user.id, {
        ...rest,
        twoFactor: {
          secret: user.pendingTwoFactor.secret,
          enabledAt: new Date().toISOString(),
          lastStep: step,
          recoveryCodes: await Promise.all(codes.map(hashRecoveryCode)),
        },
        updatedAt: new Date().toISOString(),
      } satisfies UserRecord)
      return codes
    },

    /**
     * Check a code from the app, or a recovery code, for an account that has two-factor on. A code
     * is accepted once: its time step is recorded, and a recovery code is used up.
     */
    async checkSecondFactor(user: UserRecord, code: string): Promise<'app' | 'recovery' | null> {
      const tf = user.twoFactor
      if (!tf) return null
      if (looksLikeRecoveryCode(code)) {
        const hash = await hashRecoveryCode(code)
        if (!tf.recoveryCodes.includes(hash)) return null
        await records.putRecord(USERS, user.id, {
          ...user,
          twoFactor: { ...tf, recoveryCodes: tf.recoveryCodes.filter((h) => h !== hash) },
          updatedAt: new Date().toISOString(),
        } satisfies UserRecord)
        return 'recovery'
      }
      const secret = await openSecret(tf.secret)
      const step = secret ? await matchTotp(secret, code) : null
      if (step === null || (tf.lastStep !== undefined && step <= tf.lastStep)) return null
      await records.putRecord(USERS, user.id, {
        ...user,
        twoFactor: { ...tf, lastStep: step },
        updatedAt: new Date().toISOString(),
      } satisfies UserRecord)
      return 'app'
    },

    async newRecoveryCodes(user: UserRecord): Promise<string[] | null> {
      if (!user.twoFactor) return null
      const codes = newRecoveryCodes()
      await records.putRecord(USERS, user.id, {
        ...user,
        twoFactor: {
          ...user.twoFactor,
          recoveryCodes: await Promise.all(codes.map(hashRecoveryCode)),
        },
        updatedAt: new Date().toISOString(),
      } satisfies UserRecord)
      return codes
    },

    async removeTwoFactor(user: UserRecord): Promise<void> {
      const { twoFactor: _, pendingTwoFactor: __, ...rest } = user
      await records.putRecord(USERS, user.id, {
        ...rest,
        updatedAt: new Date().toISOString(),
      } satisfies UserRecord)
    },

    // ---- personal access tokens ----

    async createToken(
      user: UserRecord,
      input: { name: string; role: Role; expiresInDays: number | null },
    ): Promise<{ token: string; record: TokenRecord }> {
      const token = TOKEN_PREFIX + toBase64Url(randomBytes(32))
      const now = Date.now()
      const record: TokenRecord = {
        id: `tok_${hex(randomBytes(12))}`,
        userId: user.id,
        name: input.name,
        role: input.role,
        prefix: token.slice(0, TOKEN_PREFIX.length + 4),
        createdAt: new Date(now).toISOString(),
        ...(input.expiresInDays !== null
          ? { expiresAt: new Date(now + input.expiresInDays * 86_400_000).toISOString() }
          : {}),
      }
      await records.putRecord(TOKENS, await sha256Hex(token), record)
      return { token, record }
    },

    /** A user's tokens, newest first. Expired ones are listed until revoked, marked by expiresAt. */
    async listTokens(userId: string): Promise<TokenRecord[]> {
      return (await tokensOf(userId))
        .map((t) => t.token)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    /**
     * The owner and effective role behind a token, or null. An expired token is deleted and
     * reported through `onExpired` so the caller can audit it. lastUsedAt is written back at most
     * every few minutes, like a session's lastSeenAt.
     */
    async resolveToken(
      token: string,
      onExpired?: (record: TokenRecord) => Promise<void>,
    ): Promise<ResolvedToken | null> {
      const key = await sha256Hex(token)
      const value = await records.getRecord(TOKENS, key)
      if (!isTokenRecord(value)) return null
      const now = Date.now()
      if (value.expiresAt && now >= Date.parse(value.expiresAt)) {
        await records.deleteRecord(TOKENS, key)
        await onExpired?.(value)
        return null
      }
      const user = await getUser(value.userId)
      if (!user || user.status !== 'active') return null
      let record = value
      if (!value.lastUsedAt || now - Date.parse(value.lastUsedAt) >= touchMs) {
        record = { ...value, lastUsedAt: new Date(now).toISOString() }
        await records.putRecord(TOKENS, key, record)
      }
      return { user, token: record, role: lowerRole(record.role, user.role) }
    },

    async revokeToken(userId: string, id: string): Promise<TokenRecord | null> {
      const match = (await tokensOf(userId)).find((t) => t.token.id === id)
      if (!match) return null
      await records.deleteRecord(TOKENS, match.key)
      return match.token
    },

    /** Revoke the token presented, for signing out a CLI. */
    async revokePresentedToken(token: string): Promise<TokenRecord | null> {
      const key = await sha256Hex(token)
      const value = await records.getRecord(TOKENS, key)
      await records.deleteRecord(TOKENS, key)
      return isTokenRecord(value) ? value : null
    },

    // ---- invites and reset links ----

    /**
     * Issue an invite, or a reset link for an existing account. Any earlier open link of the same
     * kind for the same email stops working, so only the newest one can be used.
     */
    async createInvite(input: {
      kind: 'invite' | 'reset'
      email: string
      role: Role
      userId?: string
      invitedBy: string
    }): Promise<{ token: string; invite: InviteRecord }> {
      for (const { key, invite } of await liveInvites()) {
        if (invite.kind === input.kind && invite.email === input.email) {
          await records.deleteRecord(INVITES, key)
        }
      }
      const prefix = input.kind === 'invite' ? INVITE_PREFIX : RESET_PREFIX
      const token = prefix + toBase64Url(randomBytes(32))
      const now = Date.now()
      const invite: InviteRecord = {
        id: `inv_${hex(randomBytes(12))}`,
        kind: input.kind,
        email: input.email,
        role: input.role,
        ...(input.userId ? { userId: input.userId } : {}),
        invitedBy: input.invitedBy,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(
          now + (input.kind === 'invite' ? inviteMs : RESET_LINK_MS),
        ).toISOString(),
      }
      await records.putRecord(INVITES, await sha256Hex(token), invite)
      return { token, invite }
    },

    async listInvites(): Promise<InviteRecord[]> {
      return (await liveInvites())
        .map((i) => i.invite)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    /** The open invite or reset link behind a token, or null when unknown, used or expired. */
    async findInvite(token: string): Promise<InviteRecord | null> {
      if (!token.startsWith(INVITE_PREFIX) && !token.startsWith(RESET_PREFIX)) return null
      const key = await sha256Hex(token)
      const value = await records.getRecord(INVITES, key)
      if (!isInviteRecord(value)) return null
      if (Date.now() >= Date.parse(value.expiresAt)) {
        await records.deleteRecord(INVITES, key)
        return null
      }
      return value
    },

    async consumeInvite(token: string): Promise<void> {
      await records.deleteRecord(INVITES, await sha256Hex(token))
    },

    /** Revoke an open invite or reset link by its public id. */
    async revokeInvite(id: string): Promise<InviteRecord | null> {
      const match = (await liveInvites()).find((i) => i.invite.id === id)
      if (!match) return null
      await records.deleteRecord(INVITES, match.key)
      return match.invite
    },

    async passwordParams(email: string): Promise<PasswordParams> {
      const user = await findByEmail(email)
      const salt = user?.password?.salt ?? (await fakeSalt(email))
      return {
        kdf: PASSWORD_KDF,
        iterations: user?.password?.iterations ?? PASSWORD_ITERATIONS,
        salt,
      }
    },

    /** Create an account. Returns null when the email is already taken. */
    async createUser(input: {
      email: string
      name: string
      role: Role
      salt: Uint8Array
      clientKey: Uint8Array<ArrayBuffer>
    }): Promise<UserRecord | null> {
      if (await userIdForEmail(input.email)) return null
      const now = new Date().toISOString()
      const user: UserRecord = {
        id: `usr_${hex(randomBytes(12))}`,
        email: input.email,
        name: input.name,
        role: input.role,
        status: 'active',
        password: await makeVerifier(input.salt, input.clientKey),
        createdAt: now,
        updatedAt: now,
      }
      await records.putRecord(USERS, user.id, user)
      await records.putRecord(USERS_BY_EMAIL, user.email, { userId: user.id })
      return user
    },

    checkPassword,

    // ---- SSO ----

    async findBySso(issuer: string, subject: string): Promise<UserRecord | null> {
      const value = (await records.getRecord(USERS_BY_SSO, await ssoKey(issuer, subject))) as {
        userId?: unknown
      } | null
      return typeof value?.userId === 'string' ? getUser(value.userId) : null
    },

    /** Tie an account to a provider identity, so later sign-ins find it even if the email changes. */
    async linkSso(user: UserRecord, issuer: string, subject: string): Promise<UserRecord> {
      const updated: UserRecord = {
        ...user,
        sso: { issuer, subject },
        updatedAt: new Date().toISOString(),
      }
      await records.putRecord(USERS, user.id, updated)
      await records.putRecord(USERS_BY_SSO, await ssoKey(issuer, subject), { userId: user.id })
      return updated
    },

    /** Create an account that signs in with SSO only. Returns null when the email is taken. */
    async createSsoUser(input: {
      email: string
      name: string
      role: Role
      issuer: string
      subject: string
      managed: boolean
    }): Promise<UserRecord | null> {
      if (await userIdForEmail(input.email)) return null
      const now = new Date().toISOString()
      const user: UserRecord = {
        id: `usr_${hex(randomBytes(12))}`,
        email: input.email,
        name: input.name.slice(0, MAX_NAME_LENGTH),
        role: input.role,
        status: 'active',
        sso: { issuer: input.issuer, subject: input.subject },
        ...(input.managed ? { roleManagedBy: 'sso' as const } : {}),
        createdAt: now,
        updatedAt: now,
      }
      await records.putRecord(USERS, user.id, user)
      await records.putRecord(USERS_BY_EMAIL, user.email, { userId: user.id })
      await records.putRecord(USERS_BY_SSO, await ssoKey(input.issuer, input.subject), {
        userId: user.id,
      })
      return user
    },

    async setPassword(
      user: UserRecord,
      salt: Uint8Array,
      clientKey: Uint8Array<ArrayBuffer>,
    ): Promise<void> {
      const updated: UserRecord = {
        ...user,
        password: await makeVerifier(salt, clientKey),
        updatedAt: new Date().toISOString(),
      }
      await records.putRecord(USERS, user.id, updated)
    },

    async recordLogin(user: UserRecord): Promise<void> {
      await records.putRecord(USERS, user.id, { ...user, lastLoginAt: new Date().toISOString() })
    },

    // ---- throttling ----

    async throttled(email: string, ip: string): Promise<ThrottleResult> {
      const now = Date.now()
      const attempts = await Promise.all(attemptIds(email, ip).map(readAttempt))
      const lockedUntil = Math.max(0, ...attempts.map((a) => a?.lockedUntil ?? 0))
      if (lockedUntil > now) {
        return { ok: false, retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000) }
      }
      return { ok: true }
    },

    async recordFailure(email: string, ip: string): Promise<void> {
      const now = Date.now()
      const [emailId, ipId] = attemptIds(email, ip)
      const bump = async (id: string, lockFor: (failures: number) => number) => {
        const prev = await readAttempt(id)
        const fresh = !prev || now - prev.windowStart > ATTEMPT_WINDOW_MS
        const failures = fresh ? 1 : prev.failures + 1
        const lockMs = lockFor(failures)
        const next: AttemptRecord = {
          failures,
          windowStart: fresh ? now : prev.windowStart,
          ...(lockMs > 0 ? { lockedUntil: now + lockMs } : {}),
        }
        await records.putRecord(LOGIN_ATTEMPTS, id, next)
      }
      await Promise.all([
        bump(emailId, (n) =>
          n <= EMAIL_FREE_FAILURES
            ? 0
            : Math.min(EMAIL_BASE_LOCK_MS * 2 ** (n - EMAIL_FREE_FAILURES - 1), MAX_LOCK_MS),
        ),
        bump(ipId, (n) => (n >= IP_MAX_FAILURES ? MAX_LOCK_MS : 0)),
      ])
    },

    async clearFailures(email: string): Promise<void> {
      await records.deleteRecord(LOGIN_ATTEMPTS, `email:${email}`)
    },

    // ---- sessions ----

    async createSession(
      user: UserRecord,
      userAgent: string | undefined,
      via?: 'sso',
    ): Promise<{ token: string; session: SessionRecord }> {
      const token = SESSION_PREFIX + toBase64Url(randomBytes(32))
      const now = Date.now()
      const session: SessionRecord = {
        id: `ses_${hex(randomBytes(12))}`,
        userId: user.id,
        createdAt: new Date(now).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        expiresAt: new Date(now + maxMs).toISOString(),
        ...(userAgent ? { userAgent: userAgent.slice(0, MAX_USER_AGENT_LENGTH) } : {}),
        ...(via ? { via } : {}),
      }
      await records.putRecord(SESSIONS, await sha256Hex(token), session)
      return { token, session }
    },

    /**
     * The live session and active user behind a session token, or null. Expired sessions are
     * deleted on sight. lastSeenAt is written back at most every few minutes.
     */
    async resolveSession(token: string): Promise<ResolvedSession | null> {
      const key = await sha256Hex(token)
      const value = await records.getRecord(SESSIONS, key)
      if (!isSessionRecord(value)) return null
      const now = Date.now()
      const lastSeen = Date.parse(value.lastSeenAt)
      if (now >= Date.parse(value.expiresAt) || now - lastSeen >= idleMs) {
        await records.deleteRecord(SESSIONS, key)
        return null
      }
      const user = await getUser(value.userId)
      if (!user || user.status !== 'active') return null
      let session = value
      if (now - lastSeen >= touchMs) {
        session = { ...value, lastSeenAt: new Date(now).toISOString() }
        await records.putRecord(SESSIONS, key, session)
      }
      return { user, session }
    },

    async endSession(token: string): Promise<SessionRecord | null> {
      const key = await sha256Hex(token)
      const value = await records.getRecord(SESSIONS, key)
      await records.deleteRecord(SESSIONS, key)
      return isSessionRecord(value) ? value : null
    },

    /** A user's live sessions, keyed by storage id. Expired ones are cleaned up along the way. */
    async sessionsFor(userId: string): Promise<{ key: string; session: SessionRecord }[]> {
      return (await allSessions()).filter((s) => s.session.userId === userId)
    },

    async deleteSessionKey(key: string): Promise<void> {
      await records.deleteRecord(SESSIONS, key)
    },
  }
}

export type AccountStore = ReturnType<typeof createAccountStore>

export function publicSession(session: SessionRecord, currentId: string | null): PublicSession {
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    ...(session.userAgent ? { userAgent: session.userAgent } : {}),
    current: session.id === currentId,
  }
}
