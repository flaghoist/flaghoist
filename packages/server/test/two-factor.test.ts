import { memoryAdapter } from '@flaghoist/adapter-memory'
import type { StorageAdapter } from '@flaghoist/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64Url, type UsersConfig } from '../src/accounts'
import { apiKey, bearerToken, createFlagServer, type Role } from '../src/index'
import { currentStep, totpAt } from '../src/totp'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'
const PEPPER = 'pepper-for-tests-0123456789abcdef0123456789'

const key = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
const salt = () => toBase64Url(crypto.getRandomValues(new Uint8Array(16)))

function makeServer(users: Partial<UsersConfig> = {}, storage: StorageAdapter = memoryAdapter()) {
  return createFlagServer({
    storage,
    auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
    users: { pepper: PEPPER, ...users },
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

/** A member with a password, signed in. */
async function member(app: App, email: string, role: Role = 'editor') {
  const { token } = await json<{ token: string }>(
    call(app, 'POST', '/api/v1/invites', { email, role }, ADMIN_TOKEN),
  )
  const clientKey = key()
  const body = await json<{ token: string; user: { id: string } }>(
    call(app, 'POST', '/api/v1/invites/accept', { token, salt: salt(), clientKey }),
  )
  return { session: body.token, id: body.user.id, clientKey, email }
}

const codeNow = (secret: string, offset = 0) => totpAt(secret, currentStep() + offset)

/** Turn two-factor on for a signed-in member. Returns the secret and the recovery codes. */
async function enable(app: App, session: string) {
  const { secret, uri } = await json<{ secret: string; uri: string }>(
    call(app, 'POST', '/api/v1/me/two-factor/setup', undefined, session),
  )
  expect(uri).toContain(`secret=${secret}`)
  const res = await call(
    app,
    'POST',
    '/api/v1/me/two-factor/confirm',
    { code: await codeNow(secret) },
    session,
  )
  expect(res.status).toBe(200)
  const { recoveryCodes } = (await res.json()) as { recoveryCodes: string[] }
  return { secret, recoveryCodes }
}

function login(app: App, email: string, clientKey: string) {
  return json<{ token?: string; twoFactorRequired?: boolean; challenge?: string }>(
    call(app, 'POST', '/api/v1/auth/login', { email, clientKey }),
  )
}

function secondStep(app: App, challenge: string, code: string) {
  return call(app, 'POST', '/api/v1/auth/login/two-factor', { challenge, code })
}

afterEach(() => vi.useRealTimers())

describe('setting up two-factor', () => {
  it('needs a code from the app before it turns on, and returns ten recovery codes once', async () => {
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    const { secret } = await json<{ secret: string }>(
      call(app, 'POST', '/api/v1/me/two-factor/setup', undefined, m.session),
    )
    const wrong = await call(
      app,
      'POST',
      '/api/v1/me/two-factor/confirm',
      { code: '000000' },
      m.session,
    )
    expect(wrong.status).toBe(400)
    const me1 = await json<{ twoFactor: { enabled: boolean } }>(
      call(app, 'GET', '/api/v1/auth/me', undefined, m.session),
    )
    expect(me1.twoFactor.enabled).toBe(false)

    const ok = await json<{ recoveryCodes: string[] }>(
      call(
        app,
        'POST',
        '/api/v1/me/two-factor/confirm',
        { code: await codeNow(secret) },
        m.session,
      ),
    )
    expect(ok.recoveryCodes).toHaveLength(10)
    const me2 = await json<{ twoFactor: { enabled: boolean } }>(
      call(app, 'GET', '/api/v1/auth/me', undefined, m.session),
    )
    expect(me2.twoFactor.enabled).toBe(true)
  })

  it('keeps the secret sealed and the recovery codes hashed in storage', async () => {
    const storage = memoryAdapter()
    const app = makeServer({}, storage)
    const m = await member(app, 'a@example.com')
    const { secret, recoveryCodes } = await enable(app, m.session)
    const dump = JSON.stringify(await storage.listRecords!('users'))
    expect(dump).not.toContain(secret)
    for (const code of recoveryCodes) {
      expect(dump).not.toContain(code)
      expect(dump).not.toContain(code.replace('-', ''))
    }
  })

  it('needs an account: the admin token has none to protect', async () => {
    const app = makeServer()
    const res = await call(app, 'POST', '/api/v1/me/two-factor/setup', undefined, ADMIN_TOKEN)
    expect(res.status).toBe(400)
  })
})

describe('signing in with two-factor', () => {
  it('asks for a code after the password, and only then issues a session', async () => {
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    const { secret } = await enable(app, m.session)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 30_000)

    const first = await login(app, m.email, m.clientKey)
    expect(first.token).toBeUndefined()
    expect(first.twoFactorRequired).toBe(true)

    const res = await secondStep(app, first.challenge!, await codeNow(secret))
    expect(res.status).toBe(200)
    const { token } = (await res.json()) as { token: string }
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(200)
  })

  it('refuses a wrong code, and the same code twice', async () => {
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    const { secret } = await enable(app, m.session)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 30_000)
    const { challenge } = await login(app, m.email, m.clientKey)
    expect((await secondStep(app, challenge!, '123456')).status).toBe(401)
    const code = await codeNow(secret)
    expect((await secondStep(app, challenge!, code)).status).toBe(200)
    const again = await login(app, m.email, m.clientKey)
    expect((await secondStep(app, again.challenge!, code)).status).toBe(401)
  })

  it('accepts each recovery code once, and audits it', async () => {
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    const { recoveryCodes } = await enable(app, m.session)
    const typed = recoveryCodes[0]!.toLowerCase().replace('-', ' ')
    const { challenge } = await login(app, m.email, m.clientKey)
    expect((await secondStep(app, challenge!, typed)).status).toBe(200)
    const again = await login(app, m.email, m.clientKey)
    expect((await secondStep(app, again.challenge!, recoveryCodes[0]!)).status).toBe(401)
    const { entries } = await json<{ entries: { action: string; changeDescription?: string }[] }>(
      call(app, 'GET', '/api/v1/audit?category=security', undefined, ADMIN_TOKEN),
    )
    const used = entries.find((e) => e.action === 'two_factor.recovery_used')
    expect(used?.changeDescription).toBe('9 recovery codes left')
  })

  it('lets a challenge expire after five minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    const { secret } = await enable(app, m.session)
    const { challenge } = await login(app, m.email, m.clientKey)
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1000)
    const res = await secondStep(app, challenge!, await codeNow(secret))
    expect(res.status).toBe(401)
    expect(((await res.json()) as { code: string }).code).toBe('challenge_expired')
  })

  it('counts wrong codes toward the sign-in lockout', async () => {
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    const { secret } = await enable(app, m.session)
    const { challenge } = await login(app, m.email, m.clientKey)
    for (let i = 0; i < 6; i++) await secondStep(app, challenge!, '000000')
    const locked = await secondStep(app, challenge!, await codeNow(secret, 1))
    expect(locked.status).toBe(429)
  })

  it('still asks for a code after a password reset link', async () => {
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    const { secret } = await enable(app, m.session)
    const { token } = await json<{ token: string }>(
      call(app, 'POST', `/api/v1/users/${m.id}/reset`, undefined, ADMIN_TOKEN),
    )
    const accepted = await json<{
      token?: string
      twoFactorRequired?: boolean
      challenge?: string
    }>(call(app, 'POST', '/api/v1/invites/accept', { token, salt: salt(), clientKey: key() }))
    expect(accepted.token).toBeUndefined()
    expect(accepted.twoFactorRequired).toBe(true)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 30_000)
    expect((await secondStep(app, accepted.challenge!, await codeNow(secret))).status).toBe(200)
  })
})

describe('turning two-factor off', () => {
  it('needs a current code', async () => {
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    const { secret } = await enable(app, m.session)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 30_000)
    const wrong = await call(app, 'DELETE', '/api/v1/me/two-factor', { code: '000000' }, m.session)
    expect(wrong.status).toBe(400)
    const ok = await call(
      app,
      'DELETE',
      '/api/v1/me/two-factor',
      { code: await codeNow(secret) },
      m.session,
    )
    expect(ok.status).toBe(204)
    const first = await login(app, m.email, m.clientKey)
    expect(first.token).toBeTruthy()
  })

  it('is refused when the role requires it', async () => {
    const app = makeServer({ twoFactor: 'admins' })
    const m = await member(app, 'a@example.com', 'admin')
    const { secret } = await enable(app, m.session)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 30_000)
    const res = await call(
      app,
      'DELETE',
      '/api/v1/me/two-factor',
      { code: await codeNow(secret) },
      m.session,
    )
    expect(res.status).toBe(409)
  })

  it('can be reset by an admin for someone who lost their phone, signing them out', async () => {
    const app = makeServer()
    const m = await member(app, 'a@example.com')
    await enable(app, m.session)
    const res = await call(
      app,
      'DELETE',
      `/api/v1/users/${m.id}/two-factor`,
      undefined,
      ADMIN_TOKEN,
    )
    expect(res.status).toBe(204)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, m.session)).status).toBe(401)
    expect((await login(app, m.email, m.clientKey)).token).toBeTruthy()
    const { entries } = await json<{ entries: { action: string }[] }>(
      call(app, 'GET', '/api/v1/audit?category=security', undefined, ADMIN_TOKEN),
    )
    expect(entries[0]!.action).toBe('login')
    expect(entries.some((e) => e.action === 'two_factor.reset')).toBe(true)
  })

  it('cannot be reset for an owner by an admin', async () => {
    const app = makeServer()
    const owner = await member(app, 'o@example.com', 'owner')
    const admin = await member(app, 'ad@example.com', 'admin')
    await enable(app, owner.session)
    const res = await call(
      app,
      'DELETE',
      `/api/v1/users/${owner.id}/two-factor`,
      undefined,
      admin.session,
    )
    expect(res.status).toBe(403)
  })
})

describe('requiring two-factor', () => {
  it('holds back a password session until it is set up', async () => {
    const app = makeServer({ twoFactor: 'everyone' })
    const m = await member(app, 'a@example.com', 'viewer')
    const blocked = await call(app, 'GET', '/api/v1/flags', undefined, m.session)
    expect(blocked.status).toBe(403)
    expect(((await blocked.json()) as { code: string }).code).toBe('two_factor_setup_required')
    const me = await json<{ twoFactor: { required: boolean; setupRequired: boolean } }>(
      call(app, 'GET', '/api/v1/auth/me', undefined, m.session),
    )
    expect(me.twoFactor).toMatchObject({ required: true, setupRequired: true })
    // It cannot mint an access token to get around the rule either.
    const token = await call(app, 'POST', '/api/v1/tokens', { name: 'x' }, m.session)
    expect(token.status).toBe(403)

    await enable(app, m.session)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, m.session)).status).toBe(200)
  })

  it('with "admins", applies to admins and owners only', async () => {
    const app = makeServer({ twoFactor: 'admins' })
    const editor = await member(app, 'ed@example.com', 'editor')
    const admin = await member(app, 'ad@example.com', 'admin')
    expect((await call(app, 'GET', '/api/v1/flags', undefined, editor.session)).status).toBe(200)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, admin.session)).status).toBe(403)
  })
})
