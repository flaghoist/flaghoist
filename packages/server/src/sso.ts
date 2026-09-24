import { createLocalJWKSet, errors as joseErrors, jwtVerify, type JSONWebKeySet } from 'jose'
import { fromBase64Url, toBase64Url } from './accounts'
import { isRole, ROLES, type Role } from './permissions'

/**
 * Single sign-on with an OpenID Connect provider (Okta, Microsoft Entra, Google, Auth0, Keycloak).
 * The authorization code flow with PKCE, run by the server so a client secret never reaches the
 * browser. Nothing is stored between the redirect out and the redirect back: what the callback
 * needs travels in the `state` parameter, encrypted and authenticated with a key derived from the
 * pepper. That avoids cookies, which Flaghoist does not use, and Cloudflare KV's replication delay.
 */
export interface SsoConfig {
  /** The provider's issuer URL, exactly as it appears in its ID tokens. */
  issuer: string
  clientId: string
  /** For a confidential client. Sent with HTTP Basic auth. Omit for a public client using PKCE. */
  clientSecret?: string
  /** The name on the sign-in button, as in "Continue with Okta". Default `SSO`. */
  label?: string
  /** Default `['openid', 'email', 'profile']`. Add your provider's groups scope if it needs one. */
  scopes?: string[]
  /** Only these email domains may sign in. Omit to allow any the provider vouches for. */
  allowedDomains?: string[]
  /** The ID token claim holding the person's groups. Default `groups`. */
  groupsClaim?: string
  /**
   * Group to role. When set, the provider decides roles: they are applied at every sign-in and
   * cannot be changed in Flaghoist. Someone in several mapped groups gets the highest role.
   */
  roleMapping?: Record<string, Role>
  /**
   * The role for someone in no mapped group. Omit to refuse them. Without `roleMapping`, this is
   * the role new people get on their first sign-in.
   */
  defaultRole?: Role
  /** Require `email_verified: true` before trusting the email. Default true. See the docs for Entra. */
  requireVerifiedEmail?: boolean
  /** Set false to turn off password sign-in for everyone. The admin token still works. */
  passwordSignIn?: boolean
  /**
   * The callback URL registered with the provider. Default: this server's own origin plus
   * `/api/v1/auth/sso/callback`. Set it when a proxy changes the origin the server sees.
   */
  redirectUri?: string
}

export const SSO_CALLBACK_PATH = '/api/v1/auth/sso/callback'
const STATE_TTL_MS = 10 * 60_000
const EXCHANGE_TTL_MS = 60_000
const DISCOVERY_TTL_MS = 60 * 60_000
const JWKS_TTL_MS = 10 * 60_000
const ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'ES256', 'ES384', 'EdDSA']

/** Throw when an `sso` config cannot work, at startup rather than on the first sign-in. */
export function assertSsoConfig(sso: SsoConfig): void {
  const problems: string[] = []
  try {
    const url = new URL(sso.issuer)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost')
      problems.push('issuer must use https')
  } catch {
    problems.push('issuer must be a URL')
  }
  if (typeof sso.clientId !== 'string' || !sso.clientId) problems.push('clientId is required')
  for (const [group, role] of Object.entries(sso.roleMapping ?? {})) {
    if (!isRole(role)) problems.push(`roleMapping["${group}"] is not a role`)
  }
  if (sso.defaultRole !== undefined && !isRole(sso.defaultRole)) {
    problems.push('defaultRole is not a role')
  }
  if (problems.length > 0) {
    throw new Error(`[flaghoist] users.sso: ${problems.join('; ')}.`)
  }
}

// ---------------------------------------------------------------------------
// Sealed values: AES-GCM with a key derived from the pepper
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()
const sealKeys = new Map<string, Promise<CryptoKey>>()

function sealKey(pepper: string): Promise<CryptoKey> {
  let key = sealKeys.get(pepper)
  if (!key) {
    key = (async () => {
      const material = await crypto.subtle.importKey('raw', encoder.encode(pepper), 'HKDF', false, [
        'deriveKey',
      ])
      return crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(0),
          info: encoder.encode('flaghoist sso seal v1'),
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      )
    })()
    sealKeys.set(pepper, key)
  }
  return key
}

/** Encrypt and authenticate a small JSON value. `purpose` stops one kind being replayed as another. */
export async function seal(pepper: string, purpose: string, value: object): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = encoder.encode(JSON.stringify({ ...value, purpose }))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(pepper), plain),
  )
  const out = new Uint8Array(iv.length + cipher.length)
  out.set(iv)
  out.set(cipher, iv.length)
  return toBase64Url(out)
}

/** The value inside a sealed string, or null when it was tampered with, is for another purpose, or expired. */
export async function unseal<T extends { exp: number }>(
  pepper: string,
  purpose: string,
  sealed: string,
): Promise<T | null> {
  const bytes = fromBase64Url(sealed)
  if (!bytes || bytes.length < 29) return null
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await sealKey(pepper),
      bytes.slice(12),
    )
    const value = JSON.parse(new TextDecoder().decode(plain)) as T & { purpose?: string }
    if (value.purpose !== purpose || typeof value.exp !== 'number' || Date.now() > value.exp) {
      return null
    }
    return value
  } catch {
    return null
  }
}

export async function sha256Url(text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))))
}

function randomUrl(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

// ---------------------------------------------------------------------------
// Provider metadata and keys, cached per isolate
// ---------------------------------------------------------------------------

interface Discovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  id_token_signing_alg_values_supported?: string[]
}

const discoveries = new Map<string, { at: number; value: Promise<Discovery> }>()
const keySets = new Map<string, { at: number; value: Promise<JSONWebKeySet> }>()

async function fetchJson(url: string, what: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new SsoError(`Could not load the provider's ${what} (${res.status}).`)
  return res.json()
}

function discover(issuer: string): Promise<Discovery> {
  const cached = discoveries.get(issuer)
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.value
  const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
  const value = fetchJson(url, 'configuration').then((body) => {
    const d = body as Partial<Discovery>
    if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) {
      throw new SsoError("The provider's configuration is missing its endpoints.")
    }
    return d as Discovery
  })
  value.catch(() => discoveries.delete(issuer))
  discoveries.set(issuer, { at: Date.now(), value })
  return value
}

function keySet(uri: string, refresh = false): Promise<JSONWebKeySet> {
  const cached = keySets.get(uri)
  if (!refresh && cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.value
  const value = fetchJson(uri, 'signing keys') as Promise<JSONWebKeySet>
  value.catch(() => keySets.delete(uri))
  keySets.set(uri, { at: Date.now(), value })
  return value
}

/** For tests: forget cached provider metadata and keys. */
export function clearSsoCache(): void {
  discoveries.clear()
  keySets.clear()
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

/** A failure the person signing in should see. Never carries secrets or token contents. */
export class SsoError extends Error {}

interface StartState {
  exp: number
  verifier: string
  nonce: string
  browser: string
  returnTo: string
  redirectUri: string
}

export async function buildAuthorizationUrl(input: {
  sso: SsoConfig
  pepper: string
  redirectUri: string
  returnTo: string
  browserHash: string
}): Promise<string> {
  const d = await discover(input.sso.issuer)
  const verifier = randomUrl()
  const nonce = randomUrl(16)
  const state = await seal(input.pepper, 'sso-state', {
    exp: Date.now() + STATE_TTL_MS,
    verifier,
    nonce,
    browser: input.browserHash,
    returnTo: input.returnTo,
    redirectUri: input.redirectUri,
  } satisfies StartState)
  const url = new URL(d.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', input.sso.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('scope', (input.sso.scopes ?? ['openid', 'email', 'profile']).join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', await sha256Url(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function readState(pepper: string, state: string): Promise<StartState | null> {
  return unseal<StartState>(pepper, 'sso-state', state)
}

export interface SsoIdentity {
  subject: string
  email: string
  emailVerified: boolean
  name: string
  groups: string[]
}

/** Trade the authorization code for an ID token, check it, and return who it names. */
export async function completeSignIn(input: {
  sso: SsoConfig
  state: StartState
  code: string
}): Promise<SsoIdentity> {
  const { sso, state } = input
  const d = await discover(sso.issuer)
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: state.redirectUri,
    client_id: sso.clientId,
    code_verifier: state.verifier,
  })
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  }
  if (sso.clientSecret) {
    const basic = `${encodeURIComponent(sso.clientId)}:${encodeURIComponent(sso.clientSecret)}`
    headers.authorization = `Basic ${btoa(basic)}`
  }
  const res = await fetch(d.token_endpoint, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown }
  if (!res.ok || typeof body.id_token !== 'string') {
    throw new SsoError(
      `The provider did not complete the sign-in${
        typeof body.error === 'string' ? ` (${body.error})` : ''
      }.`,
    )
  }

  const supported = d.id_token_signing_alg_values_supported
  const algorithms = supported ? ALGORITHMS.filter((a) => supported.includes(a)) : ALGORITHMS
  const verify = async (refresh: boolean) =>
    jwtVerify(body.id_token as string, createLocalJWKSet(await keySet(d.jwks_uri, refresh)), {
      issuer: sso.issuer,
      audience: sso.clientId,
      algorithms,
    })
  let payload
  try {
    payload = (await verify(false)).payload
  } catch (err) {
    // The provider may have rotated its keys since they were cached.
    if (!(err instanceof joseErrors.JWKSNoMatchingKey)) {
      throw new SsoError('The sign-in could not be verified.')
    }
    try {
      payload = (await verify(true)).payload
    } catch {
      throw new SsoError('The sign-in could not be verified.')
    }
  }
  if (payload.nonce !== state.nonce) throw new SsoError('The sign-in could not be verified.')

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!email || typeof payload.sub !== 'string') {
    throw new SsoError('The provider did not share an email address. Check the email scope.')
  }
  const claim = payload[sso.groupsClaim ?? 'groups']
  const groups = Array.isArray(claim)
    ? claim.filter((g): g is string => typeof g === 'string')
    : typeof claim === 'string'
      ? claim.split(/[,\s]+/).filter(Boolean)
      : []
  const name =
    typeof payload.name === 'string'
      ? payload.name
      : [payload.given_name, payload.family_name].filter((p) => typeof p === 'string').join(' ')
  return {
    subject: payload.sub,
    email,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name,
    groups,
  }
}

/** The role groups map to, the highest when several do; the default role; or null to refuse. */
export function roleFor(sso: SsoConfig, groups: string[]): Role | null {
  let best = -1
  for (const group of groups) {
    const role = sso.roleMapping?.[group]
    if (role && ROLES.indexOf(role) > best) best = ROLES.indexOf(role)
  }
  if (best >= 0) return ROLES[best]!
  return sso.defaultRole ?? null
}

export function domainAllowed(sso: SsoConfig, email: string): boolean {
  if (!sso.allowedDomains || sso.allowedDomains.length === 0) return true
  const domain = email.slice(email.lastIndexOf('@') + 1)
  return sso.allowedDomains.some((d) => d.toLowerCase() === domain)
}

// ---------------------------------------------------------------------------
// The hand-back to the dashboard
// ---------------------------------------------------------------------------

interface ExchangeCode {
  exp: number
  userId: string
  browser: string
}

/**
 * A short-lived code the dashboard trades for a session. Only the tab that started the sign-in can
 * use it: it has to present the secret whose hash went out in the state.
 */
export function exchangeCode(pepper: string, userId: string, browserHash: string): Promise<string> {
  return seal(pepper, 'sso-exchange', {
    exp: Date.now() + EXCHANGE_TTL_MS,
    userId,
    browser: browserHash,
  } satisfies ExchangeCode)
}

export async function redeemExchangeCode(
  pepper: string,
  code: string,
  browserSecret: string,
): Promise<string | null> {
  const value = await unseal<ExchangeCode>(pepper, 'sso-exchange', code)
  if (!value || (await sha256Url(browserSecret)) !== value.browser) return null
  return value.userId
}
