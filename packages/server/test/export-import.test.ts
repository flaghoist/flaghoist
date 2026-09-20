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

describe('export', () => {
  it('requires admin auth', async () => {
    const app = makeServer()
    expect((await app.request('/api/v1/export')).status).toBe(401)
  })

  it('exports an empty list when there are no flags', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/export', { headers: adminHeaders })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { version: number; flags: unknown[] }
    expect(body.version).toBe(1)
    expect(body.flags).toEqual([])
  })

  it('exports active flags without metadata', async () => {
    const app = makeServer()
    await app.request('/api/v1/flags/my-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 50 }, description: 'Test' }),
    })
    const res = await app.request('/api/v1/export', { headers: adminHeaders })
    const body = (await res.json()) as { version: number; flags: Record<string, unknown>[] }
    expect(body.flags).toHaveLength(1)
    expect(body.flags[0].key).toBe('my-flag')
    expect(body.flags[0].enabled).toBe(true)
    expect(body.flags[0].rollout).toEqual({ percentage: 50 })
    expect(body.flags[0].description).toBe('Test')
    expect(body.flags[0]).not.toHaveProperty('metadata')
  })

  it('excludes archived flags from export', async () => {
    const app = makeServer()
    await app.request('/api/v1/flags/active-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })
    await app.request('/api/v1/flags/archived-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false }),
    })
    await app.request('/api/v1/flags/archived-flag/archive', {
      method: 'POST',
      headers: adminHeaders,
    })
    const res = await app.request('/api/v1/export', { headers: adminHeaders })
    const body = (await res.json()) as { flags: { key: string }[] }
    expect(body.flags).toHaveLength(1)
    expect(body.flags[0].key).toBe('active-flag')
  })

  it('sets Content-Disposition header', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/export', { headers: adminHeaders })
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })
})

describe('import', () => {
  it('requires admin auth', async () => {
    const app = makeServer()
    expect(
      (
        await app.request('/api/v1/import', {
          method: 'POST',
          body: JSON.stringify({ flags: [] }),
        })
      ).status,
    ).toBe(401)
  })

  it('creates new flags', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/import', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        version: 1,
        flags: [
          { key: 'flag-a', enabled: true, rollout: { percentage: 100 } },
          { key: 'flag-b', enabled: false, rollout: { percentage: 0 } },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { created: number; updated: number; errors: unknown[] }
    expect(body.created).toBe(2)
    expect(body.updated).toBe(0)
    expect(body.errors).toEqual([])

    const list = await app.request('/api/v1/flags', { headers: adminHeaders })
    const flags = ((await list.json()) as { flags: { key: string }[] }).flags
    expect(flags.map((f) => f.key).sort()).toEqual(['flag-a', 'flag-b'])
  })

  it('updates existing flags', async () => {
    const app = makeServer()
    await app.request('/api/v1/flags/existing', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false, rollout: { percentage: 0 } }),
    })
    const res = await app.request('/api/v1/import', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        version: 1,
        flags: [{ key: 'existing', enabled: true, rollout: { percentage: 75 } }],
      }),
    })
    const body = (await res.json()) as { created: number; updated: number }
    expect(body.created).toBe(0)
    expect(body.updated).toBe(1)

    const get = await app.request('/api/v1/flags/existing', { headers: adminHeaders })
    const flag = (await get.json()) as { enabled: boolean; rollout: { percentage: number } }
    expect(flag.enabled).toBe(true)
    expect(flag.rollout.percentage).toBe(75)
  })

  it('reports errors for invalid flags without stopping', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/import', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        version: 1,
        flags: [
          { key: 'good-flag', enabled: true, rollout: { percentage: 100 } },
          { key: '!!!bad', enabled: true },
          { key: 'also-good', enabled: false, rollout: { percentage: 0 } },
        ],
      }),
    })
    const body = (await res.json()) as {
      created: number
      updated: number
      errors: { key: string }[]
    }
    expect(body.created).toBe(2)
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0].key).toBe('!!!bad')
  })

  it('rejects a missing flags array', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/import', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ version: 1 }),
    })
    expect(res.status).toBe(400)
  })

  it('records audit entries for imported flags', async () => {
    const app = makeServer()
    await app.request('/api/v1/import', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        version: 1,
        flags: [{ key: 'imported', enabled: true, rollout: { percentage: 100 } }],
      }),
    })
    const audit = await app.request('/api/v1/audit', { headers: adminHeaders })
    const body = (await audit.json()) as {
      entries: { action: string; flagKey: string; changeDescription?: string }[]
    }
    expect(body.entries).toHaveLength(1)
    expect(body.entries[0].action).toBe('create')
    expect(body.entries[0].flagKey).toBe('imported')
    expect(body.entries[0].changeDescription).toBe('Bulk import')
  })
})
