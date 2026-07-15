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

/** Read-path verifier: matches the `x-api-key` header against a shared secret in constant time. */
export function apiKey(expected: string): Authenticator {
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
