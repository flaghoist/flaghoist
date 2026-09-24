import { memoryAdapter } from '@flaghoist/adapter-memory'
import type { StorageAdapter } from '@flaghoist/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64Url } from '../src/accounts'
import { apiKey, bearerToken, createFlagServer, type Role } from '../src/index'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'
const PEPPER = 'pepper-for-tests-0123456789abcdef0123456789'

// The server only ever sees the client's PBKDF2 output, so random 32-byte keys stand in for passwords.
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

async function call(app: App, method: string, path: string, body?: unknown, token?: string) {
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

type Link = { token: string; invite: { id: string; email: string; role: Role; kind: string } }

/** Invite someone as `role` with the given credential, accept, and return their session token. */
async function join(app: App, email: string, role: Role, as = ADMIN_TOKEN) {
  const res = await call(app, 'POST', '/api/v1/invites', { email, role }, as)
  expect(res.status).toBe(201)
  const { token } = (await res.json()) as Link
  const clientKey = key()
  const accepted = await call(app, 'POST', '/api/v1/invites/accept', {
    token,
    name: email.split('@')[0],
    salt: salt(),
    clientKey,
  })
  expect(accepted.status).toBe(200)
  const body = (await accepted.json()) as { token: string; user: { id: string } }
  return { session: body.token, id: body.user.id, clientKey }
}

function login(app: App, email: string, clientKey: string) {
  return call(app, 'POST', '/api/v1/auth/login', { email, clientKey })
}

afterEach(() => vi.useRealTimers())

describe('invites', () => {
  it('turns an invite into a signed-in account with the invited role', async () => {
    const app = makeServer()
    const { session, clientKey } = await join(app, 'ed@example.com', 'editor')
    const me = await json(call(app, 'GET', '/api/v1/auth/me', undefined, session))
    expect(me).toMatchObject({ identity: 'ed@example.com', role: 'editor' })
    expect((await login(app, 'ed@example.com', clientKey)).status).toBe(200)
  })

  it('works once', async () => {
    const app = makeServer()
    const { token } = await json<Link>(
      call(app, 'POST', '/api/v1/invites', { email: 'a@example.com', role: 'viewer' }, ADMIN_TOKEN),
    )
    const accept = () =>
      call(app, 'POST', '/api/v1/invites/accept', { token, salt: salt(), clientKey: key() })
    expect((await accept()).status).toBe(200)
    const again = await accept()
    expect(again.status).toBe(410)
    expect((await again.json()) as { code: string }).toMatchObject({ code: 'link_invalid' })
  })

  it('expires after seven days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = makeServer()
    const { token } = await json<Link>(
      call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' }, ADMIN_TOKEN),
    )
    vi.setSystemTime(Date.now() + 7 * 86_400_000 + 1000)
    const res = await call(app, 'POST', '/api/v1/invites/inspect', { token })
    expect(res.status).toBe(410)
  })

  it('describes itself to the person holding the link, and nothing else', async () => {
    const app = makeServer()
    const { token } = await json<Link>(
      call(app, 'POST', '/api/v1/invites', { email: 'A@Example.com', role: 'admin' }, ADMIN_TOKEN),
    )
    const info = await json(call(app, 'POST', '/api/v1/invites/inspect', { token }))
    expect(info).toMatchObject({ kind: 'invite', email: 'a@example.com', role: 'admin' })
    const bogus = await call(app, 'POST', '/api/v1/invites/inspect', { token: 'fh_inv_nope' })
    expect(bogus.status).toBe(410)
  })

  it('stops the old link working when an invite is resent', async () => {
    const app = makeServer()
    const first = await json<Link>(
      call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' }, ADMIN_TOKEN),
    )
    const second = await json<Link>(
      call(app, 'POST', `/api/v1/invites/${first.invite.id}/resend`, undefined, ADMIN_TOKEN),
    )
    const inspect = (token: string) => call(app, 'POST', '/api/v1/invites/inspect', { token })
    expect((await inspect(first.token)).status).toBe(410)
    expect((await inspect(second.token)).status).toBe(200)
    const list = await json<{ invites: unknown[] }>(
      call(app, 'GET', '/api/v1/invites', undefined, ADMIN_TOKEN),
    )
    expect(list.invites).toHaveLength(1)
  })

  it('can be revoked', async () => {
    const app = makeServer()
    const { token, invite } = await json<Link>(
      call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' }, ADMIN_TOKEN),
    )
    const del = await call(app, 'DELETE', `/api/v1/invites/${invite.id}`, undefined, ADMIN_TOKEN)
    expect(del.status).toBe(204)
    expect((await call(app, 'POST', '/api/v1/invites/inspect', { token })).status).toBe(410)
  })

  it('refuses to invite an email that already has an account', async () => {
    const app = makeServer()
    await join(app, 'a@example.com', 'viewer')
    const res = await call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' }, ADMIN_TOKEN)
    expect(res.status).toBe(409)
  })

  it('stores only a hash of the link token', async () => {
    const storage = memoryAdapter()
    const app = makeServer(storage)
    const { token } = await json<Link>(
      call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' }, ADMIN_TOKEN),
    )
    expect(token.startsWith('fh_inv_')).toBe(true)
    const dump = JSON.stringify(await storage.listRecords!('invites'))
    expect(dump).not.toContain(token.slice('fh_inv_'.length))
  })

  it('needs the admin role, and only an owner can invite an owner', async () => {
    const app = makeServer()
    const editor = await join(app, 'ed@example.com', 'editor')
    const admin = await join(app, 'ad@example.com', 'admin')
    const asEditor = await call(
      app,
      'POST',
      '/api/v1/invites',
      { email: 'x@example.com' },
      editor.session,
    )
    expect(asEditor.status).toBe(403)
    const ownerByAdmin = await call(
      app,
      'POST',
      '/api/v1/invites',
      { email: 'x@example.com', role: 'owner' },
      admin.session,
    )
    expect(ownerByAdmin.status).toBe(403)
    const adminByAdmin = await call(
      app,
      'POST',
      '/api/v1/invites',
      { email: 'x@example.com', role: 'admin' },
      admin.session,
    )
    expect(adminByAdmin.status).toBe(201)
  })
})

describe('managing members', () => {
  it('lists members with their last activity', async () => {
    const app = makeServer()
    await join(app, 'a@example.com', 'viewer')
    const { users } = await json<{ users: { email: string; lastActiveAt?: string }[] }>(
      call(app, 'GET', '/api/v1/users', undefined, ADMIN_TOKEN),
    )
    expect(users.map((u) => u.email)).toEqual(['a@example.com'])
    expect(users[0]!.lastActiveAt).toBeTruthy()
    expect(JSON.stringify(users)).not.toContain('verifier')
  })

  it('changes a role, and a demotion signs the member out', async () => {
    const app = makeServer()
    const ed = await join(app, 'ed@example.com', 'admin')
    const res = await call(app, 'PUT', `/api/v1/users/${ed.id}`, { role: 'viewer' }, ADMIN_TOKEN)
    expect(await res.json()).toMatchObject({ role: 'viewer' })
    expect((await call(app, 'GET', '/api/v1/flags', undefined, ed.session)).status).toBe(401)
    const again = await json<{ token: string }>(login(app, 'ed@example.com', ed.clientKey))
    const put = await call(app, 'PUT', '/api/v1/flags/x', { enabled: true }, again.token)
    expect(put.status).toBe(403)
  })

  it('disables a member, who can no longer sign in, and enables them again', async () => {
    const app = makeServer()
    const a = await join(app, 'a@example.com', 'editor')
    await call(app, 'PUT', `/api/v1/users/${a.id}`, { status: 'disabled' }, ADMIN_TOKEN)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, a.session)).status).toBe(401)
    expect((await login(app, 'a@example.com', a.clientKey)).status).toBe(401)
    await call(app, 'PUT', `/api/v1/users/${a.id}`, { status: 'active' }, ADMIN_TOKEN)
    expect((await login(app, 'a@example.com', a.clientKey)).status).toBe(200)
  })

  it('removes a member and frees their email', async () => {
    const app = makeServer()
    const a = await join(app, 'a@example.com', 'editor')
    expect(
      (await call(app, 'DELETE', `/api/v1/users/${a.id}`, undefined, ADMIN_TOKEN)).status,
    ).toBe(204)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, a.session)).status).toBe(401)
    expect((await login(app, 'a@example.com', a.clientKey)).status).toBe(401)
    await join(app, 'a@example.com', 'viewer')
  })

  it('keeps admins away from owners', async () => {
    const app = makeServer()
    const owner = await join(app, 'o@example.com', 'owner')
    const admin = await join(app, 'ad@example.com', 'admin')
    const tries = [
      call(app, 'PUT', `/api/v1/users/${owner.id}`, { role: 'viewer' }, admin.session),
      call(app, 'PUT', `/api/v1/users/${owner.id}`, { status: 'disabled' }, admin.session),
      call(app, 'DELETE', `/api/v1/users/${owner.id}`, undefined, admin.session),
      call(app, 'POST', `/api/v1/users/${owner.id}/reset`, undefined, admin.session),
    ]
    for (const res of await Promise.all(tries)) expect(res.status).toBe(403)
    const promote = await call(
      app,
      'PUT',
      `/api/v1/users/${admin.id}`,
      { role: 'owner' },
      owner.session,
    )
    expect(promote.status).toBe(200)
  })

  it('never leaves the server without an owner', async () => {
    const app = makeServer()
    const owner = await join(app, 'o@example.com', 'owner')
    for (const res of [
      await call(app, 'PUT', `/api/v1/users/${owner.id}`, { role: 'admin' }, ADMIN_TOKEN),
      await call(app, 'PUT', `/api/v1/users/${owner.id}`, { status: 'disabled' }, ADMIN_TOKEN),
      await call(app, 'DELETE', `/api/v1/users/${owner.id}`, undefined, ADMIN_TOKEN),
    ]) {
      expect(res.status).toBe(409)
      expect(((await res.json()) as { code: string }).code).toBe('last_owner')
    }
    await join(app, 'o2@example.com', 'owner')
    const demote = await call(
      app,
      'PUT',
      `/api/v1/users/${owner.id}`,
      { role: 'admin' },
      ADMIN_TOKEN,
    )
    expect(demote.status).toBe(200)
  })

  it('stops a member changing their own role or removing themselves', async () => {
    const app = makeServer()
    await join(app, 'o@example.com', 'owner')
    const admin = await join(app, 'ad@example.com', 'admin')
    const self = [
      await call(app, 'PUT', `/api/v1/users/${admin.id}`, { role: 'viewer' }, admin.session),
      await call(app, 'DELETE', `/api/v1/users/${admin.id}`, undefined, admin.session),
    ]
    for (const res of self) expect(res.status).toBe(409)
  })
})

describe('reset links', () => {
  it('sets a new password, signs the member in, and ends their other sessions', async () => {
    const app = makeServer()
    const a = await join(app, 'a@example.com', 'editor')
    const { token } = await json<Link>(
      call(app, 'POST', `/api/v1/users/${a.id}/reset`, undefined, ADMIN_TOKEN),
    )
    expect(token.startsWith('fh_rst_')).toBe(true)
    const info = await json(call(app, 'POST', '/api/v1/invites/inspect', { token }))
    expect(info).toMatchObject({ kind: 'reset', email: 'a@example.com' })

    const newKey = key()
    const res = await call(app, 'POST', '/api/v1/invites/accept', {
      token,
      salt: salt(),
      clientKey: newKey,
    })
    expect(res.status).toBe(200)
    const { token: session } = (await res.json()) as { token: string }
    expect((await call(app, 'GET', '/api/v1/flags', undefined, session)).status).toBe(200)
    expect((await call(app, 'GET', '/api/v1/flags', undefined, a.session)).status).toBe(401)
    expect((await login(app, 'a@example.com', a.clientKey)).status).toBe(401)
    expect((await login(app, 'a@example.com', newKey)).status).toBe(200)
  })

  it('expires after 24 hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = makeServer()
    const a = await join(app, 'a@example.com', 'editor')
    const { token } = await json<Link>(
      call(app, 'POST', `/api/v1/users/${a.id}/reset`, undefined, ADMIN_TOKEN),
    )
    vi.setSystemTime(Date.now() + 24 * 3_600_000 + 1000)
    expect((await call(app, 'POST', '/api/v1/invites/inspect', { token })).status).toBe(410)
  })

  it('does not work once the member is removed', async () => {
    const app = makeServer()
    const a = await join(app, 'a@example.com', 'editor')
    const { token } = await json<Link>(
      call(app, 'POST', `/api/v1/users/${a.id}/reset`, undefined, ADMIN_TOKEN),
    )
    await call(app, 'DELETE', `/api/v1/users/${a.id}`, undefined, ADMIN_TOKEN)
    const res = await call(app, 'POST', '/api/v1/invites/accept', {
      token,
      salt: salt(),
      clientKey: key(),
    })
    expect(res.status).toBe(410)
  })
})

describe('audit', () => {
  it('records member changes in the security log', async () => {
    const app = makeServer()
    const a = await join(app, 'a@example.com', 'editor')
    await call(app, 'PUT', `/api/v1/users/${a.id}`, { role: 'admin' }, ADMIN_TOKEN)
    await call(app, 'POST', `/api/v1/users/${a.id}/reset`, undefined, ADMIN_TOKEN)
    await call(app, 'DELETE', `/api/v1/users/${a.id}`, undefined, ADMIN_TOKEN)
    const { entries } = await json<{ entries: { action: string; changeDescription?: string }[] }>(
      call(app, 'GET', '/api/v1/audit?category=security', undefined, ADMIN_TOKEN),
    )
    expect(entries.map((e) => e.action)).toEqual([
      'user.removed',
      'password.reset',
      'user.updated',
      'invite.accepted',
      'invite.created',
    ])
    expect(entries[2]!.changeDescription).toBe('a@example.com: role editor to admin')
  })
})
