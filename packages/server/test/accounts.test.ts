import { memoryAdapter } from '@flaghoist/adapter-memory'
import type { StorageAdapter } from '@flaghoist/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAccountStore, toBase64Url } from '../src/accounts'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'
const PEPPER = 'pepper-for-tests-0123456789abcdef0123456789'
const EMAIL = 'ada@example.com'

// The server never sees a password, only the client's PBKDF2 output, so tests stand in random
// 32-byte keys for passwords.
function key(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}
function salt(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)))
}

function makeServer(storage: StorageAdapter = memoryAdapter(), withUsers = true) {
  return createFlagServer({
    storage,
    auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
    ...(withUsers ? { users: { pepper: PEPPER } } : {}),
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

async function setupOwner(app: App, email = EMAIL) {
  const clientKey = key()
  const res = await call(
    app,
    'POST',
    '/api/v1/auth/setup',
    { email, name: 'Ada', salt: salt(), clientKey },
    ADMIN_TOKEN,
  )
  expect(res.status).toBe(201)
  return clientKey
}

async function login(app: App, clientKey: string, email = EMAIL) {
  return call(app, 'POST', '/api/v1/auth/login', { email, clientKey })
}

async function signIn(app: App, clientKey: string, email = EMAIL): Promise<string> {
  const res = await login(app, clientKey, email)
  expect(res.status).toBe(200)
  return ((await res.json()) as { token: string }).token
}

afterEach(() => {
  vi.useRealTimers()
})

describe('configuration', () => {
  it('refuses to start without a record store', () => {
    const { getRecord: _, ...noRecords } = memoryAdapter()
    expect(() => makeServer(noRecords as StorageAdapter)).toThrow(/record store/)
  })

  it('refuses to start with a short pepper', () => {
    expect(() =>
      createFlagServer({
        storage: memoryAdapter(),
        auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
        users: { pepper: 'short' },
      }),
    ).toThrow(/at least 32 characters/)
  })

  it('leaves a server without users exactly as before', async () => {
    const app = makeServer(memoryAdapter(), false)
    expect(await (await call(app, 'GET', '/api/v1/auth/config')).json()).toEqual({
      accounts: false,
    })
    expect((await login(app, key())).status).toBe(404)
    const me = await (await call(app, 'GET', '/api/v1/auth/me', undefined, ADMIN_TOKEN)).json()
    expect(me).toMatchObject({ identity: 'admin', role: 'owner', accounts: false, user: null })
  })
})

describe('first account', () => {
  it('reports that setup is needed until an account exists', async () => {
    const app = makeServer()
    const before = await (await call(app, 'GET', '/api/v1/auth/config')).json()
    expect(before).toEqual({
      accounts: true,
      password: { kdf: 'pbkdf2-sha256', iterations: 600000 },
      passwordSignIn: true,
      sso: null,
      setupRequired: true,
    })
    await setupOwner(app)
    const after = (await (await call(app, 'GET', '/api/v1/auth/config')).json()) as {
      setupRequired: boolean
    }
    expect(after.setupRequired).toBe(false)
  })

  it('needs the admin token and works only once', async () => {
    const app = makeServer()
    const body = { email: EMAIL, salt: salt(), clientKey: key() }
    expect((await call(app, 'POST', '/api/v1/auth/setup', body)).status).toBe(401)
    await setupOwner(app)
    const again = await call(app, 'POST', '/api/v1/auth/setup', body, ADMIN_TOKEN)
    expect(again.status).toBe(409)
  })

  it('rejects a malformed key rather than storing it', async () => {
    const app = makeServer()
    const res = await call(
      app,
      'POST',
      '/api/v1/auth/setup',
      { email: EMAIL, salt: salt(), clientKey: 'hunter2' },
      ADMIN_TOKEN,
    )
    expect(res.status).toBe(400)
  })
})

describe('sign-in', () => {
  it('issues a session token that works on the admin API and attributes changes', async () => {
    const app = makeServer()
    const token = await signIn(app, await setupOwner(app))
    expect(token.startsWith('fh_sess_')).toBe(true)
    const put = await call(app, 'PUT', '/api/v1/flags/checkout', { enabled: true }, token)
    expect(put.status).toBe(200)
    expect(((await put.json()) as { metadata: { updatedBy: string } }).metadata.updatedBy).toBe(
      EMAIL,
    )
    const me = await (await call(app, 'GET', '/api/v1/auth/me', undefined, token)).json()
    expect(me).toMatchObject({ identity: EMAIL, role: 'owner', user: { email: EMAIL } })
  })

  it('matches the email case-insensitively', async () => {
    const app = makeServer()
    const clientKey = await setupOwner(app)
    expect((await login(app, clientKey, 'ADA@Example.com')).status).toBe(200)
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const app = makeServer()
    await setupOwner(app)
    const wrong = await login(app, key())
    const unknown = await login(app, key(), 'nobody@example.com')
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
  })

  it('answers prelogin the same way for known and unknown emails', async () => {
    const app = makeServer()
    await setupOwner(app)
    const known = (await (
      await call(app, 'POST', '/api/v1/auth/prelogin', { email: EMAIL })
    ).json()) as Record<string, unknown>
    const unknown1 = (await (
      await call(app, 'POST', '/api/v1/auth/prelogin', { email: 'nobody@example.com' })
    ).json()) as Record<string, unknown>
    const unknown2 = (await (
      await call(app, 'POST', '/api/v1/auth/prelogin', { email: 'nobody@example.com' })
    ).json()) as Record<string, unknown>
    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown1).sort())
    expect(unknown1).toMatchObject({ kdf: 'pbkdf2-sha256', iterations: 600000 })
    expect(String(unknown1.salt)).toHaveLength(String(known.salt).length)
    // Stable, so repeating the question does not reveal that the salt is made up.
    expect(unknown1.salt).toBe(unknown2.salt)
  })

  it('never stores the client key or the session token', async () => {
    const storage = memoryAdapter()
    const app = makeServer(storage)
    const clientKey = await setupOwner(app)
    const token = await signIn(app, clientKey)
    const dump = JSON.stringify([
      await storage.listRecords!('users'),
      await storage.listRecords!('sessions'),
    ])
    expect(dump).not.toContain(clientKey)
    expect(dump).not.toContain(token)
    expect(dump).not.toContain(token.slice('fh_sess_'.length))
  })
})

describe('throttling', () => {
  it('locks an email after five failures, even against the right password', async () => {
    const app = makeServer()
    const clientKey = await setupOwner(app)
    for (let i = 0; i < 5; i++) expect((await login(app, key())).status).toBe(401)
    expect((await login(app, key())).status).toBe(401)
    const locked = await login(app, clientKey)
    expect(locked.status).toBe(429)
    expect(locked.headers.get('Retry-After')).toBeTruthy()
    expect(((await locked.json()) as { code: string }).code).toBe('login_throttled')
  })

  it('locks an unknown email the same way, so a lockout reveals nothing', async () => {
    const app = makeServer()
    for (let i = 0; i < 6; i++) await login(app, key(), 'nobody@example.com')
    expect((await login(app, key(), 'nobody@example.com')).status).toBe(429)
  })

  it('unlocks once the lock expires, and a success clears the count', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = makeServer()
    const clientKey = await setupOwner(app)
    for (let i = 0; i < 6; i++) await login(app, key())
    expect((await login(app, clientKey)).status).toBe(429)
    vi.setSystemTime(Date.now() + 61_000)
    expect((await login(app, clientKey)).status).toBe(200)
    // The count started over, so one more failure does not lock again.
    expect((await login(app, key())).status).toBe(401)
    expect((await login(app, clientKey)).status).toBe(200)
  })

  it('locks an IP address after thirty failures across many emails', async () => {
    const app = makeServer()
    const clientKey = await setupOwner(app)
    const from = (email: string, k: string) =>
      app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ email, clientKey: k }),
      })
    for (let i = 0; i < 30; i++) await from(`user${i}@example.com`, key())
    expect((await from(EMAIL, clientKey)).status).toBe(429)
    expect((await login(app, clientKey)).status).toBe(200)
  })
})

describe('sessions', () => {
  it('ends on logout', async () => {
    const app = makeServer()
    const token = await signIn(app, await setupOwner(app))
    expect((await call(app, 'POST', '/api/v1/auth/logout', undefined, token)).status).toBe(204)
    const after = await call(app, 'GET', '/api/v1/flags', undefined, token)
    expect(after.status).toBe(401)
    expect(((await after.json()) as { code: string }).code).toBe('session_expired')
  })

  it('ends after 30 idle minutes and survives activity inside that', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = makeServer()
    const token = await signIn(app, await setupOwner(app))
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(Date.now() + 20 * 60_000)
      expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(200)
    }
    vi.setSystemTime(Date.now() + 31 * 60_000)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(401)
  })

  it('ends 12 hours after sign-in however active it is', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = makeServer()
    const token = await signIn(app, await setupOwner(app))
    for (let i = 0; i < 48; i++) {
      vi.setSystemTime(Date.now() + 15 * 60_000)
      const res = await call(app, 'GET', '/api/v1/flags', undefined, token)
      expect(res.status).toBe(i < 47 ? 200 : 401)
    }
  })

  it('stops working when the account is disabled', async () => {
    const storage = memoryAdapter()
    const app = makeServer(storage)
    const token = await signIn(app, await setupOwner(app))
    const accounts = createAccountStore(storage, { pepper: PEPPER })
    const user = (await accounts.findByEmail(EMAIL))!
    await storage.putRecord!('users', user.id, { ...user, status: 'disabled' })
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(401)
  })

  it('lists and revokes the signed-in user’s sessions', async () => {
    const app = makeServer()
    const clientKey = await setupOwner(app)
    const first = await signIn(app, clientKey)
    const second = await signIn(app, clientKey)
    const list = (await (
      await call(app, 'GET', '/api/v1/me/sessions', undefined, first)
    ).json()) as { sessions: { id: string; current: boolean }[] }
    expect(list.sessions).toHaveLength(2)
    const other = list.sessions.find((s) => !s.current)!
    const del = await call(app, 'DELETE', `/api/v1/me/sessions/${other.id}`, undefined, first)
    expect(del.status).toBe(204)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, second)).status).toBe(401)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, first)).status).toBe(200)
  })

  it('signs out every other session at once', async () => {
    const app = makeServer()
    const clientKey = await setupOwner(app)
    const keep = await signIn(app, clientKey)
    const a = await signIn(app, clientKey)
    const b = await signIn(app, clientKey)
    const res = await call(app, 'DELETE', '/api/v1/me/sessions', undefined, keep)
    expect(await res.json()).toEqual({ revoked: 2 })
    for (const t of [a, b]) {
      expect((await call(app, 'GET', '/api/v1/flags', undefined, t)).status).toBe(401)
    }
    expect((await call(app, 'GET', '/api/v1/flags', undefined, keep)).status).toBe(200)
  })

  it('needs an account, not the admin token, to list sessions', async () => {
    const app = makeServer()
    const res = await call(app, 'GET', '/api/v1/me/sessions', undefined, ADMIN_TOKEN)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('account_required')
  })
})

describe('changing the password', () => {
  it('needs the current password', async () => {
    const app = makeServer()
    const token = await signIn(app, await setupOwner(app))
    const res = await call(
      app,
      'PUT',
      '/api/v1/me/password',
      { currentClientKey: key(), salt: salt(), clientKey: key() },
      token,
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('invalid_password')
  })

  it('replaces the password, keeps this session, and signs out the others', async () => {
    const app = makeServer()
    const oldKey = await setupOwner(app)
    const current = await signIn(app, oldKey)
    const other = await signIn(app, oldKey)
    const newKey = key()
    const newSalt = salt()
    const res = await call(
      app,
      'PUT',
      '/api/v1/me/password',
      { currentClientKey: oldKey, salt: newSalt, clientKey: newKey },
      current,
    )
    expect(await res.json()).toEqual({ revokedSessions: 1 })
    expect((await call(app, 'GET', '/api/v1/flags', undefined, current)).status).toBe(200)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, other)).status).toBe(401)
    expect((await login(app, oldKey)).status).toBe(401)
    expect((await login(app, newKey)).status).toBe(200)
    const pre = (await (
      await call(app, 'POST', '/api/v1/auth/prelogin', { email: EMAIL })
    ).json()) as { salt: string }
    expect(pre.salt).toBe(newSalt)
  })
})

describe('roles and attribution', () => {
  it('holds an account to its role', async () => {
    const storage = memoryAdapter()
    const app = makeServer(storage)
    await setupOwner(app)
    const accounts = createAccountStore(storage, { pepper: PEPPER })
    const viewerKey = crypto.getRandomValues(new Uint8Array(32))
    await accounts.createUser({
      email: 'vi@example.com',
      name: 'Vi',
      role: 'viewer',
      salt: crypto.getRandomValues(new Uint8Array(16)),
      clientKey: viewerKey,
    })
    const token = await signIn(app, toBase64Url(viewerKey), 'vi@example.com')
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(200)
    const put = await call(app, 'PUT', '/api/v1/flags/x', { enabled: true }, token)
    expect(put.status).toBe(403)
    expect(((await put.json()) as { code: string }).code).toBe('insufficient_role')
  })

  it('labels the admin token as break-glass once accounts are on', async () => {
    const app = makeServer()
    await call(app, 'PUT', '/api/v1/flags/x', { enabled: true }, ADMIN_TOKEN)
    const audit = (await (
      await call(app, 'GET', '/api/v1/audit', undefined, ADMIN_TOKEN)
    ).json()) as { entries: { actor: string }[] }
    expect(audit.entries[0]?.actor).toBe('owner (break-glass)')
  })
})

describe('security log', () => {
  type Page = { entries: { action: string; actor: string; flagKey?: string }[] }

  it('records sign-ins, failures and webhook changes apart from flag history', async () => {
    const app = makeServer()
    const clientKey = await setupOwner(app)
    await login(app, key())
    const token = await signIn(app, clientKey)
    await call(app, 'PUT', '/api/v1/flags/x', { enabled: true }, token)
    await call(app, 'POST', '/api/v1/webhooks', { url: 'https://example.com/hook' }, token)

    const security = (await (
      await call(app, 'GET', '/api/v1/audit?category=security', undefined, token)
    ).json()) as Page
    expect(security.entries.map((e) => e.action)).toEqual([
      'webhook.created',
      'login',
      'login.failed',
      'user.created',
    ])
    expect(security.entries.every((e) => e.flagKey === undefined)).toBe(true)

    const flags = (await (await call(app, 'GET', '/api/v1/audit', undefined, token)).json()) as Page
    expect(flags.entries.map((e) => e.action)).toEqual(['create'])
  })

  it('is admin only', async () => {
    const storage = memoryAdapter()
    const app = makeServer(storage)
    await setupOwner(app)
    const accounts = createAccountStore(storage, { pepper: PEPPER })
    const editorKey = crypto.getRandomValues(new Uint8Array(32))
    await accounts.createUser({
      email: 'ed@example.com',
      name: 'Ed',
      role: 'editor',
      salt: crypto.getRandomValues(new Uint8Array(16)),
      clientKey: editorKey,
    })
    const token = await signIn(app, toBase64Url(editorKey), 'ed@example.com')
    expect((await call(app, 'GET', '/api/v1/audit', undefined, token)).status).toBe(200)
    const res = await call(app, 'GET', '/api/v1/audit?category=security', undefined, token)
    expect(res.status).toBe(403)
  })
})
