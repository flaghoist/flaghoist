import { memoryAdapter } from '@flaghoist/adapter-memory'
import type { StorageAdapter } from '@flaghoist/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64Url } from '../src/accounts'
import { apiKey, bearerToken, createFlagServer, type Role } from '../src/index'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'
const PEPPER = 'pepper-for-tests-0123456789abcdef0123456789'

const key = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
const salt = () => toBase64Url(crypto.getRandomValues(new Uint8Array(16)))

function makeServer(storage: StorageAdapter = memoryAdapter()) {
  return createFlagServer({
    storage,
    auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
    users: { pepper: PEPPER },
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

/** A member with `role`, signed in. Returns their session and id. */
async function member(app: App, email: string, role: Role) {
  const { token } = await json<{ token: string }>(
    call(app, 'POST', '/api/v1/invites', { email, role }, ADMIN_TOKEN),
  )
  const body = await json<{ token: string; user: { id: string } }>(
    call(app, 'POST', '/api/v1/invites/accept', { token, salt: salt(), clientKey: key() }),
  )
  return { session: body.token, id: body.user.id }
}

type Created = {
  token: string
  info: { id: string; role: Role; prefix: string; expiresAt?: string; name: string }
}

async function createToken(app: App, as: string, body: Record<string, unknown>) {
  const res = await call(app, 'POST', '/api/v1/tokens', body, as)
  expect(res.status).toBe(201)
  return (await res.json()) as Created
}

afterEach(() => vi.useRealTimers())

describe('personal access tokens', () => {
  it('act as their owner, and changes are recorded under the owner', async () => {
    const app = makeServer()
    const ed = await member(app, 'ed@example.com', 'editor')
    const { token, info } = await createToken(app, ed.session, { name: 'CI' })
    expect(token.startsWith('fh_pat_')).toBe(true)
    expect(token.startsWith(info.prefix)).toBe(true)
    expect(info.role).toBe('editor')

    const put = await call(app, 'PUT', '/api/v1/flags/x', { enabled: true }, token)
    expect(put.status).toBe(200)
    expect(((await put.json()) as { metadata: { updatedBy: string } }).metadata.updatedBy).toBe(
      'ed@example.com',
    )
    const me = await json(call(app, 'GET', '/api/v1/auth/me', undefined, token))
    expect(me).toMatchObject({ identity: 'ed@example.com', role: 'editor', session: null })
    expect((me as { token: { name: string } }).token.name).toBe('CI')
  })

  it('can be narrower than their owner', async () => {
    const app = makeServer()
    const ad = await member(app, 'ad@example.com', 'admin')
    const { token } = await createToken(app, ad.session, { name: 'read only', role: 'viewer' })
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(200)
    const put = await call(app, 'PUT', '/api/v1/flags/x', { enabled: true }, token)
    expect(put.status).toBe(403)
  })

  it('can never be wider than the credential that creates them', async () => {
    const app = makeServer()
    const ed = await member(app, 'ed@example.com', 'editor')
    const tooHigh = await call(
      app,
      'POST',
      '/api/v1/tokens',
      { name: 'x', role: 'admin' },
      ed.session,
    )
    expect(tooHigh.status).toBe(403)
    // A viewer token of an owner cannot mint an owner token either.
    const owner = await member(app, 'o@example.com', 'owner')
    const narrow = await createToken(app, owner.session, { name: 'narrow', role: 'viewer' })
    const escalate = await call(
      app,
      'POST',
      '/api/v1/tokens',
      { name: 'wide', role: 'owner' },
      narrow.token,
    )
    expect(escalate.status).toBe(403)
  })

  it('follow their owner down: a demotion caps them, disabling stops them', async () => {
    const app = makeServer()
    const ad = await member(app, 'ad@example.com', 'admin')
    const { token } = await createToken(app, ad.session, { name: 'CI' })
    await call(app, 'PUT', `/api/v1/users/${ad.id}`, { role: 'viewer' }, ADMIN_TOKEN)
    const me = await json(call(app, 'GET', '/api/v1/auth/me', undefined, token))
    expect(me).toMatchObject({ role: 'viewer' })
    expect((await call(app, 'PUT', '/api/v1/flags/x', { enabled: true }, token)).status).toBe(403)
    await call(app, 'PUT', `/api/v1/users/${ad.id}`, { status: 'disabled' }, ADMIN_TOKEN)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(401)
  })

  it('stop working when their owner is removed', async () => {
    const storage = memoryAdapter()
    const app = makeServer(storage)
    const ed = await member(app, 'ed@example.com', 'editor')
    const { token } = await createToken(app, ed.session, { name: 'CI' })
    await call(app, 'DELETE', `/api/v1/users/${ed.id}`, undefined, ADMIN_TOKEN)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(401)
    expect(await storage.listRecords!('tokens')).toEqual([])
  })

  it('expire after 90 days by default, and the expiry is audited', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = makeServer()
    const ed = await member(app, 'ed@example.com', 'editor')
    const { token, info } = await createToken(app, ed.session, { name: 'CI' })
    expect(Date.parse(info.expiresAt!) - Date.now()).toBeCloseTo(90 * 86_400_000, -4)
    vi.setSystemTime(Date.now() + 89 * 86_400_000)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(200)
    vi.setSystemTime(Date.now() + 2 * 86_400_000)
    const res = await call(app, 'GET', '/api/v1/flags', undefined, token)
    expect(res.status).toBe(401)
    expect(((await res.json()) as { code: string }).code).toBe('token_invalid')
    const { entries } = await json<{ entries: { action: string }[] }>(
      call(app, 'GET', '/api/v1/audit?category=security', undefined, ADMIN_TOKEN),
    )
    expect(entries[0]!.action).toBe('token.expired')
  })

  it('can be made to never expire, but only on purpose', async () => {
    const app = makeServer()
    const ed = await member(app, 'ed@example.com', 'editor')
    const { info } = await createToken(app, ed.session, { name: 'CI', expiresInDays: null })
    expect(info.expiresAt).toBeUndefined()
    for (const bad of [0, -1, 1.5, 4000, 'soon']) {
      const res = await call(
        app,
        'POST',
        '/api/v1/tokens',
        { name: 'x', expiresInDays: bad },
        ed.session,
      )
      expect(res.status).toBe(400)
    }
  })

  it('are listed and revoked by their owner only', async () => {
    const app = makeServer()
    const ed = await member(app, 'ed@example.com', 'editor')
    const vi2 = await member(app, 'vi@example.com', 'viewer')
    const { token, info } = await createToken(app, ed.session, { name: 'CI' })
    const list = await json<{ tokens: { id: string; lastUsedAt?: string }[] }>(
      call(app, 'GET', '/api/v1/tokens', undefined, ed.session),
    )
    expect(list.tokens.map((t) => t.id)).toEqual([info.id])
    expect(JSON.stringify(list)).not.toContain(token)
    const other = await call(app, 'DELETE', `/api/v1/tokens/${info.id}`, undefined, vi2.session)
    expect(other.status).toBe(404)
    const own = await call(app, 'DELETE', `/api/v1/tokens/${info.id}`, undefined, ed.session)
    expect(own.status).toBe(204)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(401)
  })

  it('record when they were last used', async () => {
    const app = makeServer()
    const ed = await member(app, 'ed@example.com', 'editor')
    const { token } = await createToken(app, ed.session, { name: 'CI' })
    await call(app, 'GET', '/api/v1/flags', undefined, token)
    const { tokens } = await json<{ tokens: { lastUsedAt?: string }[] }>(
      call(app, 'GET', '/api/v1/tokens', undefined, ed.session),
    )
    expect(tokens[0]!.lastUsedAt).toBeTruthy()
  })

  it('are revoked by signing out with them', async () => {
    const app = makeServer()
    const ed = await member(app, 'ed@example.com', 'editor')
    const { token } = await createToken(app, ed.session, { name: 'laptop' })
    expect((await call(app, 'POST', '/api/v1/auth/logout', undefined, token)).status).toBe(204)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, token)).status).toBe(401)
  })

  it('are stored only as a hash', async () => {
    const storage = memoryAdapter()
    const app = makeServer(storage)
    const ed = await member(app, 'ed@example.com', 'editor')
    const { token } = await createToken(app, ed.session, { name: 'CI' })
    const dump = JSON.stringify(await storage.listRecords!('tokens'))
    expect(dump).not.toContain(token.slice('fh_pat_'.length + 4))
  })

  it('need an account: the admin token has no tokens of its own', async () => {
    const app = makeServer()
    const res = await call(app, 'POST', '/api/v1/tokens', { name: 'x' }, ADMIN_TOKEN)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('account_required')
  })

  it('are audited when created and revoked', async () => {
    const app = makeServer()
    const ed = await member(app, 'ed@example.com', 'editor')
    const { info } = await createToken(app, ed.session, { name: 'CI', role: 'viewer' })
    await call(app, 'DELETE', `/api/v1/tokens/${info.id}`, undefined, ed.session)
    const { entries } = await json<{ entries: { action: string; changeDescription?: string }[] }>(
      call(app, 'GET', '/api/v1/audit?category=security', undefined, ADMIN_TOKEN),
    )
    expect(entries.slice(0, 2).map((e) => e.action)).toEqual(['token.revoked', 'token.created'])
    expect(entries[1]!.changeDescription).toMatch(/^CI as viewer, expires \d{4}-\d{2}-\d{2}$/)
  })
})
