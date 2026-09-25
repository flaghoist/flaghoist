import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { toBase64Url } from '../src/accounts'
import { apiKey, bearerToken, createFlagServer, type Role } from '../src/index'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'
const PEPPER = 'pepper-for-tests-0123456789abcdef0123456789'

const key = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
const salt = () => toBase64Url(crypto.getRandomValues(new Uint8Array(16)))

function makeServer(environments: string[] = ['production', 'staging']) {
  return createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
    users: { pepper: PEPPER },
    ...(environments.length > 0 ? { environments } : {}),
  })
}

type App = ReturnType<typeof makeServer>

function call(
  app: App,
  method: string,
  path: string,
  options: { body?: unknown; token?: string; env?: string } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  if (options.env) headers['x-flaghoist-environment'] = options.env
  return app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

async function json<T = Record<string, unknown>>(res: Response | Promise<Response>): Promise<T> {
  return (await (await res).json()) as T
}

async function member(app: App, email: string, role: Role) {
  const { token } = await json<{ token: string }>(
    call(app, 'POST', '/api/v1/invites', { body: { email, role }, token: ADMIN_TOKEN }),
  )
  const body = await json<{ token: string; user: { id: string } }>(
    call(app, 'POST', '/api/v1/invites/accept', {
      body: { token, salt: salt(), clientKey: key() },
    }),
  )
  return { session: body.token, id: body.user.id }
}

function setRoles(app: App, id: string, environmentRoles: unknown, token = ADMIN_TOKEN) {
  return call(app, 'PUT', `/api/v1/users/${id}`, { body: { environmentRoles }, token })
}

const writeFlag = (app: App, token: string, env: string) =>
  call(app, 'PUT', '/api/v1/flags/checkout', { body: { enabled: true }, token, env })

describe('roles per environment', () => {
  it('lets a viewer edit flags in staging only', async () => {
    const app = makeServer()
    const v = await member(app, 'v@example.com', 'viewer')
    expect((await setRoles(app, v.id, { staging: 'editor' })).status).toBe(200)
    expect((await writeFlag(app, v.session, 'staging')).status).toBe(200)
    expect((await writeFlag(app, v.session, 'production')).status).toBe(403)
    // No header means the default environment, production.
    const noHeader = await call(app, 'PUT', '/api/v1/flags/checkout', {
      body: { enabled: true },
      token: v.session,
    })
    expect(noHeader.status).toBe(403)
  })

  it('lets an editor be read-only in production', async () => {
    const app = makeServer()
    const e = await member(app, 'e@example.com', 'editor')
    await setRoles(app, e.id, { production: 'viewer' })
    expect((await writeFlag(app, e.session, 'production')).status).toBe(403)
    expect((await writeFlag(app, e.session, 'staging')).status).toBe(200)
    const read = await call(app, 'GET', '/api/v1/flags', { token: e.session, env: 'production' })
    expect(read.status).toBe(200)
  })

  it('never reaches beyond flags: members and webhooks use the main role', async () => {
    const app = makeServer()
    const v = await member(app, 'v@example.com', 'viewer')
    await setRoles(app, v.id, { staging: 'admin' })
    const del = await call(app, 'DELETE', '/api/v1/flags/checkout', {
      token: v.session,
      env: 'staging',
    })
    expect(del.status).not.toBe(403)
    const members = await call(app, 'GET', '/api/v1/users', { token: v.session, env: 'staging' })
    expect(members.status).toBe(403)
    const hooks = await call(app, 'GET', '/api/v1/webhooks', { token: v.session, env: 'staging' })
    expect(hooks.status).toBe(403)
  })

  it('are capped by the access token in use', async () => {
    const app = makeServer()
    const v = await member(app, 'v@example.com', 'viewer')
    await setRoles(app, v.id, { staging: 'editor' })
    const { token } = await json<{ token: string }>(
      call(app, 'POST', '/api/v1/tokens', { body: { name: 'ci' }, token: v.session }),
    )
    // The token was made at the viewer's main role, so it stays read-only even in staging.
    expect((await writeFlag(app, token, 'staging')).status).toBe(403)
  })

  it('are reported per environment on /auth/me', async () => {
    const app = makeServer()
    const v = await member(app, 'v@example.com', 'viewer')
    await setRoles(app, v.id, { staging: 'editor' })
    const me = await json<{ environmentRoles: Record<string, string> }>(
      call(app, 'GET', '/api/v1/auth/me', { token: v.session }),
    )
    expect(me.environmentRoles).toEqual({ production: 'viewer', staging: 'editor' })
  })

  it('are cleared with null, and replaced as a whole', async () => {
    const app = makeServer()
    const v = await member(app, 'v@example.com', 'viewer')
    await setRoles(app, v.id, { staging: 'editor', production: 'editor' })
    const res = await json<{ environmentRoles?: Record<string, string> }>(
      setRoles(app, v.id, { staging: null, production: 'editor' }),
    )
    expect(res.environmentRoles).toEqual({ production: 'editor' })
    const cleared = await json<{ environmentRoles?: Record<string, string> }>(
      setRoles(app, v.id, {}),
    )
    expect(cleared.environmentRoles).toBeUndefined()
  })

  it('refuse unknown environments, owner overrides, and servers without environments', async () => {
    const app = makeServer()
    const v = await member(app, 'v@example.com', 'viewer')
    expect((await setRoles(app, v.id, { qa: 'editor' })).status).toBe(400)
    expect((await setRoles(app, v.id, { staging: 'owner' })).status).toBe(400)
    const o = await member(app, 'o@example.com', 'owner')
    expect((await setRoles(app, o.id, { staging: 'viewer' })).status).toBe(400)

    const single = makeServer([])
    const s = await member(single, 's@example.com', 'viewer')
    expect((await setRoles(single, s.id, { production: 'editor' })).status).toBe(400)
  })

  it('cannot be changed for yourself', async () => {
    const app = makeServer()
    const a = await member(app, 'a@example.com', 'admin')
    const res = await setRoles(app, a.id, { staging: 'viewer' }, a.session)
    expect(res.status).toBe(409)
  })

  it('are audited', async () => {
    const app = makeServer()
    const v = await member(app, 'v@example.com', 'viewer')
    await setRoles(app, v.id, { staging: 'editor' })
    await setRoles(app, v.id, {})
    const { entries } = await json<{ entries: { action: string; changeDescription?: string }[] }>(
      call(app, 'GET', '/api/v1/audit?category=security', { token: ADMIN_TOKEN }),
    )
    expect(entries.slice(0, 2).map((e) => e.changeDescription)).toEqual([
      'v@example.com: role in staging: main role',
      'v@example.com: role in staging: editor',
    ])
  })
})
