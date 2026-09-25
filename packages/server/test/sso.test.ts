import { memoryAdapter } from '@flaghoist/adapter-memory'
import type { StorageAdapter } from '@flaghoist/core'
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey as JoseKey, type JWK } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toBase64Url } from '../src/accounts'
import { apiKey, bearerToken, createFlagServer, type Role, type SsoConfig } from '../src/index'
import { clearSsoCache, sha256Url } from '../src/sso'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'
const PEPPER = 'pepper-for-tests-0123456789abcdef0123456789'
const ISSUER = 'https://idp.example.com'
const CLIENT_ID = 'flaghoist-client'
const RETURN = 'http://localhost/admin/'

// ---- A fake OpenID provider -------------------------------------------------

let signingKey: JoseKey
let otherKey: JoseKey
let jwk: JWK

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  signingKey = pair.privateKey
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  otherKey = (await generateKeyPair('RS256')).privateKey
})

interface Pending {
  claims: Record<string, unknown>
  nonce: string
  challenge: string
  redirectUri: string
}

type TokenTweak = {
  nonce?: string
  audience?: string
  key?: JoseKey
}

function fakeProvider() {
  const pending = new Map<string, Pending>()
  const seen: { authorization?: string | null }[] = []
  let tweak: TokenTweak = {}

  const fetchStub = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        id_token_signing_alg_values_supported: ['RS256'],
      })
    }
    if (url === `${ISSUER}/jwks`) return Response.json({ keys: [jwk] })
    if (url === `${ISSUER}/token`) {
      const form = new URLSearchParams(String(init?.body))
      const headers = new Headers(init?.headers)
      seen.push({ authorization: headers.get('authorization') })
      const p = pending.get(form.get('code') ?? '')
      if (!p) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      pending.delete(form.get('code')!)
      if ((await sha256Url(form.get('code_verifier') ?? '')) !== p.challenge) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 })
      }
      if (form.get('redirect_uri') !== p.redirectUri) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 })
      }
      const idToken = await new SignJWT({ nonce: tweak.nonce ?? p.nonce, ...p.claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(ISSUER)
        .setAudience(tweak.audience ?? CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(tweak.key ?? signingKey)
      return Response.json({ id_token: idToken, access_token: 'at', token_type: 'Bearer' })
    }
    return new Response('not found', { status: 404 })
  })

  return {
    fetchStub,
    seen,
    setTweak(t: TokenTweak) {
      tweak = t
    },
    /** What the provider does when the browser arrives: sign the person in and issue a code. */
    authorize(location: string, claims: Record<string, unknown>) {
      const url = new URL(location)
      const code = `code-${Math.random().toString(36).slice(2)}`
      pending.set(code, {
        claims,
        nonce: url.searchParams.get('nonce')!,
        challenge: url.searchParams.get('code_challenge')!,
        redirectUri: url.searchParams.get('redirect_uri')!,
      })
      return { code, state: url.searchParams.get('state')! }
    },
  }
}

// ---- The server under test --------------------------------------------------

function makeServer(sso: Partial<SsoConfig> = {}, storage: StorageAdapter = memoryAdapter()) {
  return createFlagServer({
    storage,
    auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
    users: {
      pepper: PEPPER,
      sso: {
        issuer: ISSUER,
        clientId: CLIENT_ID,
        label: 'Okta',
        roleMapping: { 'flag-admins': 'admin', engineering: 'editor' },
        ...sso,
      },
    },
  })
}

type App = ReturnType<typeof makeServer>

function call(app: App, method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function json<T = Record<string, unknown>>(res: Response | Promise<Response>): Promise<T> {
  return (await (await res).json()) as T
}

let idp: ReturnType<typeof fakeProvider>

beforeEach(() => {
  clearSsoCache()
  idp = fakeProvider()
  vi.stubGlobal('fetch', idp.fetchStub)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const claimsFor = (email: string, groups: string[] = [], extra: Record<string, unknown> = {}) => ({
  sub: `sub-${email}`,
  email,
  email_verified: true,
  name: email.split('@')[0],
  groups,
  ...extra,
})

/**
 * Run the whole round trip: the dashboard starts, the provider signs the person in, the callback
 * lands back on the dashboard. Returns the fragment the dashboard receives and the tab secret.
 */
async function signInWithSso(
  app: App,
  claims: Record<string, unknown>,
  options: { returnTo?: string; secret?: string } = {},
) {
  const secret = options.secret ?? toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const start = await app.request(
    `/api/v1/auth/sso/start?return=${encodeURIComponent(options.returnTo ?? RETURN)}&browser=${await sha256Url(secret)}`,
  )
  expect(start.status).toBe(302)
  const { code, state } = idp.authorize(start.headers.get('location')!, claims)
  const callback = await app.request(
    `/api/v1/auth/sso/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  )
  expect(callback.status).toBe(302)
  const location = callback.headers.get('location')!
  const fragment = new URLSearchParams(new URL(location).hash.slice(1))
  return { location, secret, code: fragment.get('sso'), error: fragment.get('sso_error') }
}

async function sessionFor(app: App, claims: Record<string, unknown>) {
  const result = await signInWithSso(app, claims)
  expect(result.error).toBeNull()
  const res = await call(app, 'POST', '/api/v1/auth/sso/exchange', {
    code: result.code,
    browserSecret: result.secret,
  })
  expect(res.status).toBe(200)
  return (await res.json()) as { token: string; user: { id: string; role: Role } }
}

// ---- Tests ------------------------------------------------------------------

describe('SSO sign-in', () => {
  it('sends the browser to the provider with PKCE, a nonce and sealed state', async () => {
    const app = makeServer()
    const res = await app.request(
      `/api/v1/auth/sso/start?return=${encodeURIComponent(RETURN)}&browser=${'a'.repeat(43)}`,
    )
    const url = new URL(res.headers.get('location')!)
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`)
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost/api/v1/auth/sso/callback')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('nonce')).toBeTruthy()
    // The state is sealed: the return address and verifier are not readable in it.
    expect(url.searchParams.get('state')).not.toContain('admin')
  })

  it('creates the account on first sign-in with the role its groups map to', async () => {
    const app = makeServer()
    const { token, user } = await sessionFor(app, claimsFor('ada@acme.com', ['engineering']))
    expect(user.role).toBe('editor')
    const me = await json(call(app, 'GET', '/api/v1/auth/me', undefined, token))
    expect(me).toMatchObject({ identity: 'ada@acme.com', role: 'editor' })
    const { users } = await json<{ users: Record<string, unknown>[] }>(
      call(app, 'GET', '/api/v1/users', undefined, ADMIN_TOKEN),
    )
    expect(users[0]).toMatchObject({ email: 'ada@acme.com', sso: true, roleManagedBy: 'sso' })
  })

  it('gives the highest role when several groups map', async () => {
    const app = makeServer()
    const { user } = await sessionFor(app, claimsFor('a@acme.com', ['engineering', 'flag-admins']))
    expect(user.role).toBe('admin')
  })

  it('re-applies the groups at every sign-in', async () => {
    const app = makeServer()
    const first = await sessionFor(app, claimsFor('a@acme.com', ['flag-admins']))
    expect(first.user.role).toBe('admin')
    const second = await sessionFor(app, claimsFor('a@acme.com', ['engineering']))
    expect(second.user.role).toBe('editor')
    expect(second.user.id).toBe(first.user.id)
  })

  it('refuses someone in no mapped group, and audits it', async () => {
    const app = makeServer()
    const result = await signInWithSso(app, claimsFor('x@acme.com', ['marketing']))
    expect(result.code).toBeNull()
    expect(result.error).toMatch(/not in a group that has access/)
    const { entries } = await json<{ entries: { action: string; changeDescription?: string }[] }>(
      call(app, 'GET', '/api/v1/audit?category=security', undefined, ADMIN_TOKEN),
    )
    expect(entries[0]).toMatchObject({ action: 'login.failed' })
    expect(entries[0]!.changeDescription).toMatch(/^SSO: no mapped group/)
  })

  it('uses defaultRole for someone in no mapped group, when set', async () => {
    const app = makeServer({ defaultRole: 'viewer' })
    const { user } = await sessionFor(app, claimsFor('x@acme.com', ['marketing']))
    expect(user.role).toBe('viewer')
  })

  it('refuses email domains outside the allowlist', async () => {
    const app = makeServer({ allowedDomains: ['acme.com'] })
    const result = await signInWithSso(app, claimsFor('x@evil.com', ['flag-admins']))
    expect(result.error).toMatch(/not allowed to sign in here/)
  })

  it('refuses an unverified email, unless told to trust the provider', async () => {
    const claims = claimsFor('x@acme.com', ['engineering'], { email_verified: false })
    const strict = await signInWithSso(makeServer(), claims)
    expect(strict.error).toMatch(/not verified your email/)
    const trusting = makeServer({ requireVerifiedEmail: false })
    await sessionFor(trusting, claims)
  })

  it('links an existing password account with the same email', async () => {
    const app = makeServer({ roleMapping: undefined })
    const { token } = await json<{ token: string }>(
      call(app, 'POST', '/api/v1/invites', { email: 'ada@acme.com', role: 'admin' }, ADMIN_TOKEN),
    )
    const accepted = await json<{ user: { id: string } }>(
      call(app, 'POST', '/api/v1/invites/accept', {
        token,
        salt: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
        clientKey: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
      }),
    )
    const { user } = await sessionFor(app, claimsFor('ada@acme.com'))
    expect(user.id).toBe(accepted.user.id)
    expect(user.role).toBe('admin')
  })

  it('accepts an open invite by signing in as the invited email', async () => {
    const app = makeServer({ roleMapping: undefined })
    await call(
      app,
      'POST',
      '/api/v1/invites',
      { email: 'new@acme.com', role: 'editor' },
      ADMIN_TOKEN,
    )
    const { user } = await sessionFor(app, claimsFor('new@acme.com'))
    expect(user.role).toBe('editor')
    const { invites } = await json<{ invites: unknown[] }>(
      call(app, 'GET', '/api/v1/invites', undefined, ADMIN_TOKEN),
    )
    expect(invites).toEqual([])
  })

  it('refuses a disabled account', async () => {
    const app = makeServer()
    const { user } = await sessionFor(app, claimsFor('a@acme.com', ['engineering']))
    await call(app, 'PUT', `/api/v1/users/${user.id}`, { status: 'disabled' }, ADMIN_TOKEN)
    const again = await signInWithSso(app, claimsFor('a@acme.com', ['engineering']))
    expect(again.error).toMatch(/disabled/)
  })

  it('keeps SSO-managed roles out of reach of the Members page', async () => {
    const app = makeServer()
    const { user } = await sessionFor(app, claimsFor('a@acme.com', ['engineering']))
    const res = await call(app, 'PUT', `/api/v1/users/${user.id}`, { role: 'admin' }, ADMIN_TOKEN)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('managed_by_sso')
  })

  it('sends the client secret with HTTP Basic auth when there is one', async () => {
    const app = makeServer({ clientSecret: 's3cret' })
    await sessionFor(app, claimsFor('a@acme.com', ['engineering']))
    expect(idp.seen.at(-1)!.authorization).toBe(`Basic ${btoa(`${CLIENT_ID}:s3cret`)}`)
  })
})

describe('SSO and environment roles', () => {
  it('lets an admin give a group-managed member a different role in one environment', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
      environments: ['production', 'staging'],
      users: {
        pepper: PEPPER,
        sso: { issuer: ISSUER, clientId: CLIENT_ID, roleMapping: { engineering: 'viewer' } },
      },
    })
    const { user } = await sessionFor(app, claimsFor('a@acme.com', ['engineering']))
    const mainRole = await call(
      app,
      'PUT',
      `/api/v1/users/${user.id}`,
      { role: 'editor' },
      ADMIN_TOKEN,
    )
    expect(mainRole.status).toBe(409)
    const perEnv = await call(
      app,
      'PUT',
      `/api/v1/users/${user.id}`,
      { environmentRoles: { staging: 'editor' } },
      ADMIN_TOKEN,
    )
    expect(perEnv.status).toBe(200)
    // The next sign-in re-applies the group role and keeps the environment role.
    const again = await sessionFor(app, claimsFor('a@acme.com', ['engineering']))
    const me = await json<{ environmentRoles: Record<string, string> }>(
      call(app, 'GET', '/api/v1/auth/me', undefined, again.token),
    )
    expect(me.environmentRoles).toEqual({ production: 'viewer', staging: 'editor' })
  })
})

describe('what SSO refuses', () => {
  it('a hand-back used from another tab', async () => {
    const app = makeServer()
    const result = await signInWithSso(app, claimsFor('a@acme.com', ['engineering']))
    const res = await call(app, 'POST', '/api/v1/auth/sso/exchange', {
      code: result.code,
      browserSecret: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    })
    expect(res.status).toBe(410)
  })

  it('a hand-back older than a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = makeServer()
    const result = await signInWithSso(app, claimsFor('a@acme.com', ['engineering']))
    vi.setSystemTime(Date.now() + 61_000)
    const res = await call(app, 'POST', '/api/v1/auth/sso/exchange', {
      code: result.code,
      browserSecret: result.secret,
    })
    expect(res.status).toBe(410)
  })

  it('a tampered or expired state', async () => {
    const app = makeServer()
    const tampered = await app.request('/api/v1/auth/sso/callback?code=x&state=AAAAbogus')
    expect(tampered.status).toBe(400)

    vi.useFakeTimers({ toFake: ['Date'] })
    const start = await app.request(
      `/api/v1/auth/sso/start?return=${encodeURIComponent(RETURN)}&browser=${'a'.repeat(43)}`,
    )
    const { code, state } = idp.authorize(start.headers.get('location')!, claimsFor('a@acme.com'))
    vi.setSystemTime(Date.now() + 11 * 60_000)
    const late = await app.request(
      `/api/v1/auth/sso/callback?code=${code}&state=${encodeURIComponent(state)}`,
    )
    expect(late.status).toBe(400)
  })

  it('an ID token with the wrong nonce, audience or signature', async () => {
    const app = makeServer()
    const claims = claimsFor('a@acme.com', ['engineering'])
    for (const tweak of [{ nonce: 'replayed' }, { audience: 'someone-else' }, { key: otherKey }]) {
      idp.setTweak(tweak)
      const result = await signInWithSso(app, claims)
      expect(result.code).toBeNull()
      expect(result.error).toBe('The sign-in could not be verified.')
    }
  })

  it('a return address on another origin, unless it is allowed', async () => {
    const app = makeServer()
    const evil = await app.request(
      `/api/v1/auth/sso/start?return=${encodeURIComponent('https://evil.example/')}&browser=${'a'.repeat(43)}`,
    )
    expect(evil.status).toBe(400)

    const withOrigin = createFlagServer({
      storage: memoryAdapter(),
      auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
      allowedOrigins: ['http://localhost:5173'],
      users: {
        pepper: PEPPER,
        sso: { issuer: ISSUER, clientId: CLIENT_ID, defaultRole: 'viewer' },
      },
    })
    const result = await signInWithSso(withOrigin, claimsFor('a@acme.com'), {
      returnTo: 'http://localhost:5173/',
    })
    expect(result.location.startsWith('http://localhost:5173/#sso=')).toBe(true)
  })

  it('the provider reporting an error', async () => {
    const app = makeServer()
    const start = await app.request(
      `/api/v1/auth/sso/start?return=${encodeURIComponent(RETURN)}&browser=${'a'.repeat(43)}`,
    )
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const res = await app.request(
      `/api/v1/auth/sso/callback?error=access_denied&error_description=${encodeURIComponent('User cancelled')}&state=${encodeURIComponent(state)}`,
    )
    expect(res.headers.get('location')).toBe(`${RETURN}#sso_error=User%20cancelled`)
  })
})

describe('SSO only', () => {
  it('turns off password sign-in and says so', async () => {
    const app = makeServer({ passwordSignIn: false })
    const config = await json(call(app, 'GET', '/api/v1/auth/config'))
    expect(config).toMatchObject({ passwordSignIn: false, sso: { label: 'Okta' } })
    const login = await call(app, 'POST', '/api/v1/auth/login', {
      email: 'a@acme.com',
      clientKey: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    })
    expect(login.status).toBe(409)
    expect(((await login.json()) as { code: string }).code).toBe('password_disabled')
  })

  it('points invites at SSO instead of a password', async () => {
    const app = makeServer({ passwordSignIn: false })
    const { token } = await json<{ token: string }>(
      call(app, 'POST', '/api/v1/invites', { email: 'n@acme.com' }, ADMIN_TOKEN),
    )
    const res = await call(app, 'POST', '/api/v1/invites/accept', {
      token,
      salt: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      clientKey: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toMatch(
      /Continue with Okta as n@acme.com/,
    )
  })

  it('still lets the admin token in', async () => {
    const app = makeServer({ passwordSignIn: false })
    expect((await call(app, 'GET', '/api/v1/flags', undefined, ADMIN_TOKEN)).status).toBe(200)
  })
})

describe('configuration', () => {
  it('refuses a role mapping to something that is not a role', () => {
    expect(() => makeServer({ roleMapping: { admins: 'superuser' as Role } })).toThrow(
      /roleMapping\["admins"\] is not a role/,
    )
  })

  it('refuses an issuer over plain http', () => {
    expect(() => makeServer({ issuer: 'http://idp.example.com' })).toThrow(/https/)
  })
})
