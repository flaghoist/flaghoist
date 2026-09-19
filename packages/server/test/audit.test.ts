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
    const body = (await res.json()) as { entries: unknown[]; total: number }
    expect(body.entries).toEqual([])
    expect(body.total).toBe(0)
  })

  it('records create, update, and delete with snapshots', async () => {
    const app = makeServer()

    await app.request('/api/v1/flags/test-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false }),
    })

    await app.request('/api/v1/flags/test-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 75 } }),
    })

    await app.request('/api/v1/flags/test-flag', { method: 'DELETE', headers: adminHeaders })

    const res = await app.request('/api/v1/audit', { headers: adminHeaders })
    const body = (await res.json()) as {
      entries: {
        id: string
        action: string
        flagKey: string
        actor: string
        timestamp: string
        previous?: { enabled: boolean; rollout: { percentage: number } }
        current?: { enabled: boolean; rollout: { percentage: number } }
      }[]
      total: number
    }

    expect(body.total).toBe(3)
    expect(body.entries).toHaveLength(3)

    const [del, update, create] = body.entries
    expect(del!.action).toBe('delete')
    expect(del!.previous?.enabled).toBe(true)
    expect(del!.previous?.rollout.percentage).toBe(75)
    expect(del!.current).toBeUndefined()

    expect(update!.action).toBe('update')
    expect(update!.previous?.enabled).toBe(false)
    expect(update!.current?.enabled).toBe(true)
    expect(update!.current?.rollout.percentage).toBe(75)

    expect(create!.action).toBe('create')
    expect(create!.previous).toBeUndefined()
    expect(create!.current?.enabled).toBe(false)

    expect(body.entries.every((e) => e.id && e.timestamp && e.actor)).toBe(true)
  })

  it('filters by action query param', async () => {
    const app = makeServer()

    await app.request('/api/v1/flags/a', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })
    await app.request('/api/v1/flags/a', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false }),
    })
    await app.request('/api/v1/flags/a', { method: 'DELETE', headers: adminHeaders })

    const res = await app.request('/api/v1/audit?action=update', { headers: adminHeaders })
    const body = (await res.json()) as { entries: { action: string }[]; total: number }
    expect(body.total).toBe(1)
    expect(body.entries[0]!.action).toBe('update')
  })

  it('paginates with limit and offset', async () => {
    const app = makeServer()

    for (let i = 0; i < 5; i++) {
      await app.request(`/api/v1/flags/flag-${i}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ enabled: true }),
      })
    }

    const page1 = await app.request('/api/v1/audit?limit=2&offset=0', { headers: adminHeaders })
    const body1 = (await page1.json()) as { entries: unknown[]; total: number }
    expect(body1.total).toBe(5)
    expect(body1.entries).toHaveLength(2)

    const page2 = await app.request('/api/v1/audit?limit=2&offset=2', { headers: adminHeaders })
    const body2 = (await page2.json()) as { entries: unknown[]; total: number }
    expect(body2.entries).toHaveLength(2)
  })

  it('records changeDescription from the PUT body', async () => {
    const app = makeServer()

    await app.request('/api/v1/flags/desc-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, changeDescription: 'turning on for launch' }),
    })

    await app.request('/api/v1/flags/desc-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false, changeDescription: 'rollback after incident #7' }),
    })

    await app.request('/api/v1/flags/desc-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })

    const res = await app.request('/api/v1/audit', { headers: adminHeaders })
    const body = (await res.json()) as {
      entries: { action: string; changeDescription?: string }[]
    }

    expect(body.entries[0]!.changeDescription).toBeUndefined()
    expect(body.entries[1]!.changeDescription).toBe('rollback after incident #7')
    expect(body.entries[2]!.changeDescription).toBe('turning on for launch')
  })

  it('ignores blank changeDescription', async () => {
    const app = makeServer()

    await app.request('/api/v1/flags/blank-desc', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, changeDescription: '   ' }),
    })

    const res = await app.request('/api/v1/audit', { headers: adminHeaders })
    const body = (await res.json()) as {
      entries: { changeDescription?: string }[]
    }
    expect(body.entries[0]!.changeDescription).toBeUndefined()
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
    const body = (await res.json()) as { entries: unknown[]; total: number }
    expect(body.entries).toHaveLength(1)
    expect(body.total).toBe(1)
  })
})
