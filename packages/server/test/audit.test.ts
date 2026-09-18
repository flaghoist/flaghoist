import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const adminHeaders = { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }

function makeServer() {
  return createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
  })
}

describe('audit log', () => {
  it('requires admin auth', async () => {
    const app = makeServer()
    expect((await app.request('/api/v1/audit')).status).toBe(401)
  })

  it('starts empty', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/audit', { headers: adminHeaders })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: unknown[] }
    expect(body.entries).toEqual([])
  })

  it('records create, update, and delete actions', async () => {
    const app = makeServer()

    await app.request('/api/v1/flags/test-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false }),
    })

    await app.request('/api/v1/flags/test-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })

    await app.request('/api/v1/flags/test-flag', { method: 'DELETE', headers: adminHeaders })

    const res = await app.request('/api/v1/audit', { headers: adminHeaders })
    const body = (await res.json()) as {
      entries: { action: string; flagKey: string; actor: string; timestamp: string }[]
    }

    expect(body.entries).toHaveLength(3)
    expect(body.entries[0]!.action).toBe('delete')
    expect(body.entries[1]!.action).toBe('update')
    expect(body.entries[2]!.action).toBe('create')
    expect(body.entries[0]!.flagKey).toBe('test-flag')
    expect(body.entries[0]!.actor).toBeTruthy()
    expect(body.entries[0]!.timestamp).toBeTruthy()
  })

  it('is also available at the legacy unversioned path', async () => {
    const app = makeServer()

    await app.request('/api/v1/flags/x', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false }),
    })

    const res = await app.request('/audit', { headers: adminHeaders })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: unknown[] }
    expect(body.entries).toHaveLength(1)
  })
})
