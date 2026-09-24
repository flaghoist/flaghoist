import { memoryAdapter } from '@flaghoist/adapter-memory'
import { createFlag } from '@flaghoist/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apiKey,
  bearerToken,
  can,
  createFlagServer,
  type Authenticator,
  type Role,
} from '../src/index'

// Written out by hand rather than derived from the code under test, so a mistake in the role
// table fails here instead of being mirrored.
const ORDER: Role[] = ['viewer', 'editor', 'admin', 'owner']

type Route = { method: string; path: string; body?: unknown; min: Role }

const ROUTES: Route[] = [
  { method: 'GET', path: '/api/v1/flags', min: 'viewer' },
  { method: 'GET', path: '/api/v1/flags/seed', min: 'viewer' },
  { method: 'GET', path: '/api/v1/export', min: 'viewer' },
  { method: 'GET', path: '/api/v1/environments', min: 'viewer' },
  { method: 'GET', path: '/api/v1/audit', min: 'viewer' },
  { method: 'PUT', path: '/api/v1/flags/new-flag', body: { enabled: true }, min: 'editor' },
  { method: 'POST', path: '/api/v1/flags/seed/archive', min: 'editor' },
  { method: 'POST', path: '/api/v1/flags/seed/restore', min: 'editor' },
  { method: 'DELETE', path: '/api/v1/flags/seed', min: 'admin' },
  { method: 'GET', path: '/api/v1/audit?category=security', min: 'admin' },
  { method: 'POST', path: '/api/v1/import', body: { flags: [] }, min: 'admin' },
  { method: 'GET', path: '/api/v1/webhooks', min: 'admin' },
  {
    method: 'POST',
    path: '/api/v1/webhooks',
    body: { url: 'https://example.com/hook' },
    min: 'admin',
  },
  { method: 'GET', path: '/api/v1/webhooks/missing', min: 'admin' },
  { method: 'PUT', path: '/api/v1/webhooks/missing', body: { enabled: false }, min: 'admin' },
  { method: 'DELETE', path: '/api/v1/webhooks/missing', min: 'admin' },
  { method: 'POST', path: '/api/v1/webhooks/missing/test', min: 'admin' },
]

/** Admin verifier whose role comes from a test header. No header means a verifier with no role. */
const roleFromHeader: Authenticator = (headers) => {
  const role = headers.get('x-test-role')
  if (role === null) return { ok: true, identity: 'legacy-admin' }
  return { ok: true, identity: `${role}@example.com`, role: role as Role }
}

function makeServer(admin: Authenticator = roleFromHeader) {
  return createFlagServer({
    storage: memoryAdapter([createFlag({ key: 'seed', enabled: true })]),
    auth: { admin, read: apiKey('read-key-for-tests') },
  })
}

function send(app: ReturnType<typeof makeServer>, route: Route, role?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (role !== undefined) headers['x-test-role'] = role
  return app.request(route.path, {
    method: route.method,
    headers,
    body: route.body === undefined ? undefined : JSON.stringify(route.body),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('role table', () => {
  it('grants each permission to its minimum role and every role above it', () => {
    expect(can('viewer', 'flags:read')).toBe(true)
    expect(can('viewer', 'audit:read')).toBe(true)
    expect(can('viewer', 'flags:write')).toBe(false)
    expect(can('editor', 'flags:write')).toBe(true)
    expect(can('editor', 'flags:delete')).toBe(false)
    expect(can('editor', 'webhooks:manage')).toBe(false)
    expect(can('admin', 'flags:delete')).toBe(true)
    expect(can('admin', 'flags:import')).toBe(true)
    expect(can('admin', 'webhooks:manage')).toBe(true)
    expect(can('owner', 'webhooks:manage')).toBe(true)
    expect(can('editor', 'audit:security')).toBe(false)
    expect(can('admin', 'audit:security')).toBe(true)
  })

  it('grants nothing to an unknown role', () => {
    expect(can('superuser', 'flags:read')).toBe(false)
    expect(can(undefined, 'flags:read')).toBe(false)
  })
})

describe('admin routes enforce roles', () => {
  for (const route of ROUTES) {
    for (const role of ORDER) {
      const allowed = ORDER.indexOf(role) >= ORDER.indexOf(route.min)
      it(`${route.method} ${route.path} is ${allowed ? 'allowed' : 'refused'} for ${role}`, async () => {
        // Keep the webhook test route from reaching the network.
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => new Response('ok')),
        )
        const res = await send(makeServer(), route, role)
        if (allowed) {
          expect(res.status).not.toBe(403)
        } else {
          expect(res.status).toBe(403)
          expect(await res.json()).toEqual({
            error: `This needs the ${route.min} role or higher.`,
            code: 'insufficient_role',
          })
        }
      })
    }
  }

  it('applies the same checks on the legacy unversioned paths', async () => {
    const res = await makeServer().request('/flags/seed', {
      method: 'DELETE',
      headers: { 'x-test-role': 'editor' },
    })
    expect(res.status).toBe(403)
  })
})

describe('backwards compatibility', () => {
  it('treats a verifier that reports no role as owner', async () => {
    for (const route of ROUTES) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('ok')),
      )
      const res = await send(makeServer(), route)
      expect(res.status, `${route.method} ${route.path}`).not.toBe(403)
    }
  })

  it('keeps bearerToken at full access', async () => {
    const app = makeServer(bearerToken('a-long-admin-token-for-tests'))
    const res = await app.request('/api/v1/flags/seed', {
      method: 'DELETE',
      headers: { authorization: 'Bearer a-long-admin-token-for-tests' },
    })
    expect(res.status).toBe(204)
  })

  it('still answers a rejected credential with its own status, not a role error', async () => {
    const app = makeServer(bearerToken('a-long-admin-token-for-tests'))
    const res = await app.request('/api/v1/flags', { headers: { authorization: 'Bearer wrong' } })
    expect(res.status).toBe(401)
  })
})

describe('refusals are safe', () => {
  it('refuses an unknown role everywhere, reads included', async () => {
    for (const route of ROUTES) {
      const res = await send(makeServer(), route, 'superuser')
      expect(res.status, `${route.method} ${route.path}`).toBe(403)
    }
  })

  it('changes nothing when a write is refused', async () => {
    const app = makeServer()
    const put = await send(
      app,
      { method: 'PUT', path: '/api/v1/flags/sneaky', body: { enabled: true }, min: 'editor' },
      'viewer',
    )
    expect(put.status).toBe(403)

    const get = await send(app, { method: 'GET', path: '/api/v1/flags/sneaky', min: 'viewer' })
    expect(get.status).toBe(404)
    const audit = await send(app, { method: 'GET', path: '/api/v1/audit', min: 'viewer' })
    expect(((await audit.json()) as { total: number }).total).toBe(0)
  })

  it('does not deliver a test webhook for a caller below admin', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchSpy)
    const app = makeServer()
    const created = await send(
      app,
      {
        method: 'POST',
        path: '/api/v1/webhooks',
        body: { url: 'https://example.com/h' },
        min: 'admin',
      },
      'admin',
    )
    const { id } = (await created.json()) as { id: string }

    const res = await send(
      app,
      { method: 'POST', path: `/api/v1/webhooks/${id}/test`, min: 'admin' },
      'editor',
    )
    expect(res.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('attribution', () => {
  it('records the caller identity on the flag and in the audit log', async () => {
    const app = makeServer()
    await send(
      app,
      { method: 'PUT', path: '/api/v1/flags/attributed', body: { enabled: true }, min: 'editor' },
      'editor',
    )
    const flag = (await (
      await send(app, { method: 'GET', path: '/api/v1/flags/attributed', min: 'viewer' })
    ).json()) as { metadata: { updatedBy: string } }
    expect(flag.metadata.updatedBy).toBe('editor@example.com')

    const audit = (await (
      await send(app, { method: 'GET', path: '/api/v1/audit', min: 'viewer' })
    ).json()) as { entries: { actor: string }[] }
    expect(audit.entries[0]!.actor).toBe('editor@example.com')
  })
})
