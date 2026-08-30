import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import type { Authenticator } from './types'

function extractBearer(headers: Headers): string | null {
  const header = headers.get('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (!token || scheme?.toLowerCase() !== 'bearer') return null
  return token.trim() || null
}

/**
 * Constant-time string equality. Both inputs are hashed with SHA-256 and the fixed-length
 * digests are compared without short-circuiting, so neither the length nor the matching prefix
 * of the secret leaks through timing. Works on every runtime via Web Crypto.
 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const va = new Uint8Array(da)
  const vb = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= (va[i] as number) ^ (vb[i] as number)
  return diff === 0
}

/**
 * The shortest shared secret we do not warn about. Below this a secret is guessable by an attacker
 * who can make requests freely, and Flaghoist does not rate limit, so a weak token is the softest
 * part of the zero-config model. Sixteen characters of hex is 64 bits, a reasonable floor.
 */
const MIN_SECRET_LENGTH = 16

// Which weak secrets have already been warned about, keyed by a short hash so the secret itself is
// never retained. Deduped per isolate, so a weak token warns once rather than on every request.
const warnedWeakSecrets = new Set<number>()

/**
 * A cheap, synchronous, non-cryptographic hash of a secret, used only to dedup the weak-secret
 * warning so the same secret is not logged twice. It is not a security primitive: a collision would
 * at worst suppress one duplicate warning. Hashing (rather than storing the secret) just keeps the
 * raw secret out of the dedup set.
 */
function weakSecretKey(secret: string): number {
  let hash = 5381
  for (let i = 0; i < secret.length; i++) hash = ((hash << 5) + hash) ^ secret.charCodeAt(i)
  return hash >>> 0
}

/**
 * Warn once, to the server log, when a shared secret is short enough to be worth guessing. This is
 * guidance, not a wall: rejecting a short secret outright could lock an operator out of a running
 * service, so the choice stays theirs. The check short-circuits for a strong secret, so the common
 * case does no work.
 *
 * Synchronous on purpose. It once hashed the secret with `crypto.subtle.digest` and warned from the
 * resulting promise, but that made the warning fire on an unpredictable later tick: it could be lost
 * if the process exited first, and it bled across test boundaries. The dedup key does not need to be
 * cryptographic, so a plain synchronous hash both fixes that and keeps the secret out of the set.
 */
function warnIfWeakSecret(kind: string, secret: string): void {
  if (secret.length >= MIN_SECRET_LENGTH) return
  const key = weakSecretKey(secret)
  if (warnedWeakSecrets.has(key)) return
  warnedWeakSecrets.add(key)
  console.warn(
    `[flaghoist] the ${kind} is ${secret.length} characters. Use a long random value ` +
      `(for example \`openssl rand -hex 32\`); a short secret is guessable, especially since ` +
      `Flaghoist does not rate limit authentication.`,
  )
}

/** Read-path verifier: matches the `x-api-key` header against a shared secret in constant time. */
export function apiKey(expected: string): Authenticator {
  warnIfWeakSecret('read API key', expected)
  return async (headers) => {
    const provided = headers.get('x-api-key')
    if (!provided || !(await safeEqual(provided, expected))) {
      return { ok: false, status: 401, message: 'Invalid or missing API key' }
    }
    return { ok: true, identity: 'api-key' }
  }
}

/**
 * Admin-path verifier: matches an `Authorization: Bearer <token>` against a shared secret in
 * constant time. The zero-config default — possession of the token is admin authorization.
 */
export function bearerToken(expected: string): Authenticator {
  warnIfWeakSecret('admin token', expected)
  return async (headers) => {
    const provided = extractBearer(headers)
    if (!provided || !(await safeEqual(provided, expected))) {
      return { ok: false, status: 401, message: 'Invalid or missing bearer token' }
    }
    return { ok: true, identity: 'admin' }
  }
}

export interface OidcOptions {
  /** Token issuer URL, validated against the `iss` claim. */
  issuer: string
  /** Expected `aud` claim (your app/client id). */
  audience: string
  /** JWKS URL. Defaults to `<issuer>/.well-known/jwks.json`. */
  jwksUri?: string
  /** Allowed signature algorithms. Defaults to `['RS256']`. `alg: none` is always rejected. */
  algorithms?: string[]
  /** Optional `token_use` claim to require (e.g. `'id'` for Cognito id tokens). */
  tokenUse?: string
  /** Claim holding the caller's groups. Defaults to `'groups'`. */
  groupsClaim?: string
  /** If set, the caller must belong to at least one of these groups (authorization). */
  allowedGroups?: string[]
  /** Advanced/testing: supply a key resolver instead of fetching the remote JWKS. */
  keyResolver?: JWTVerifyGetKey
}

function defaultJwksUri(issuer: string): string {
  const base = issuer.endsWith('/') ? issuer : `${issuer}/`
  return new URL('.well-known/jwks.json', base).toString()
}

function extractGroups(payload: JWTPayload, claim: string): string[] {
  const value = payload[claim]
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string')
  if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean)
  return []
}

/**
 * Admin-path verifier backed by an OIDC provider (Cognito, Auth0, Okta, Keycloak, Entra, …).
 * Validates the JWT signature against the provider's JWKS with a pinned algorithm allowlist,
 * checks `iss`/`aud`/`exp`/`nbf` (and optionally `token_use`), then enforces group membership.
 * Signature/claim validation is delegated to the audited `jose` library.
 */
export function oidc(options: OidcOptions): Authenticator {
  const resolveKey =
    options.keyResolver ?? createRemoteJWKSet(new URL(defaultJwksUri(options.issuer)))
  const algorithms = options.algorithms ?? ['RS256']

  return async (headers) => {
    const token = extractBearer(headers)
    if (!token) return { ok: false, status: 401, message: 'Missing bearer token' }

    let payload: JWTPayload
    try {
      const verified = await jwtVerify(token, resolveKey, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms,
      })
      payload = verified.payload
    } catch {
      return { ok: false, status: 401, message: 'Invalid token' }
    }

    if (options.tokenUse && payload['token_use'] !== options.tokenUse) {
      return { ok: false, status: 401, message: 'Invalid token' }
    }

    if (options.allowedGroups && options.allowedGroups.length > 0) {
      const groups = extractGroups(payload, options.groupsClaim ?? 'groups')
      const allowed = options.allowedGroups
      if (!groups.some((group) => allowed.includes(group))) {
        return { ok: false, status: 403, message: 'Admin group required' }
      }
    }

    const email = typeof payload['email'] === 'string' ? payload['email'] : undefined
    const sub = typeof payload.sub === 'string' ? payload.sub : undefined
    return { ok: true, identity: email ?? sub ?? 'unknown' }
  }
}
