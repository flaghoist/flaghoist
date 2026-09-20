import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it, vi } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const adminHeaders = { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }

function makeServer() {
  return createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
  })
}

describe('webhook CRUD', () => {
  it('requires admin auth', async () => {
    const app = makeServer()
    expect((await app.request('/api/v1/webhooks')).status).toBe(401)
    expect(
      (
        await app.request('/api/v1/webhooks', {
          method: 'POST',
          body: JSON.stringify({ url: 'https://example.com/hook' }),
        })
      ).status,
    ).toBe(401)
  })

  it('creates a webhook with all events by default', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://example.com/hook' }),
    })
    expect(res.status).toBe(201)
    const hook = (await res.json()) as {
      id: string
      url: string
      secret: string
      events: string[]
      enabled: boolean
    }
    expect(hook.id).toBeTruthy()
    expect(hook.url).toBe('https://example.com/hook')
    expect(hook.secret).toBeTruthy()
    expect(hook.secret.length).toBe(64)
    expect(hook.events).toHaveLength(5)
    expect(hook.enabled).toBe(true)
  })

  it('creates a webhook with specific events', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        url: 'https://example.com/hook',
        events: ['flag.created', 'flag.deleted'],
        enabled: false,
      }),
    })
    const hook = (await res.json()) as { events: string[]; enabled: boolean }
    expect(hook.events).toEqual(['flag.created', 'flag.deleted'])
    expect(hook.enabled).toBe(false)
  })

  it('rejects invalid URLs', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'not-a-url' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects unknown events', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://example.com/hook', events: ['flag.exploded'] }),
    })
    expect(res.status).toBe(400)
  })

  it('lists webhooks', async () => {
    const app = makeServer()
    await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://a.example.com' }),
    })
    await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://b.example.com' }),
    })
    const res = await app.request('/api/v1/webhooks', { headers: adminHeaders })
    const body = (await res.json()) as { webhooks: { url: string }[] }
    expect(body.webhooks).toHaveLength(2)
  })

  it('gets a single webhook', async () => {
    const app = makeServer()
    const created = (await (
      await app.request('/api/v1/webhooks', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ url: 'https://example.com/hook' }),
      })
    ).json()) as { id: string }

    const res = await app.request(`/api/v1/webhooks/${created.id}`, { headers: adminHeaders })
    expect(res.status).toBe(200)
    const hook = (await res.json()) as { id: string; url: string }
    expect(hook.id).toBe(created.id)
    expect(hook.url).toBe('https://example.com/hook')
  })

  it('returns 404 for missing webhook', async () => {
    const app = makeServer()
    const res = await app.request('/api/v1/webhooks/nonexistent', { headers: adminHeaders })
    expect(res.status).toBe(404)
  })

  it('updates a webhook', async () => {
    const app = makeServer()
    const created = (await (
      await app.request('/api/v1/webhooks', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ url: 'https://example.com/hook' }),
      })
    ).json()) as { id: string }

    const res = await app.request(`/api/v1/webhooks/${created.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://new.example.com', enabled: false }),
    })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as { url: string; enabled: boolean }
    expect(updated.url).toBe('https://new.example.com')
    expect(updated.enabled).toBe(false)
  })

  it('deletes a webhook', async () => {
    const app = makeServer()
    const created = (await (
      await app.request('/api/v1/webhooks', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ url: 'https://example.com/hook' }),
      })
    ).json()) as { id: string }

    const res = await app.request(`/api/v1/webhooks/${created.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    })
    expect(res.status).toBe(204)

    const get = await app.request(`/api/v1/webhooks/${created.id}`, { headers: adminHeaders })
    expect(get.status).toBe(404)
  })
})

describe('webhook dispatch', () => {
  it('fires webhooks on flag creation', async () => {
    const app = makeServer()
    const received: { body: unknown; headers: Record<string, string> }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('example.com')) {
          received.push({
            body: JSON.parse(init?.body as string),
            headers: Object.fromEntries(
              Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v as string]),
            ),
          })
          return new Response('OK', { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }),
    )

    await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://example.com/hook' }),
    })

    await app.request('/api/v1/flags/my-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })

    // Wait for async dispatch
    await new Promise((r) => setTimeout(r, 50))

    expect(received.length).toBeGreaterThanOrEqual(1)
    const delivery = received.find((r) => (r.body as { event: string }).event === 'flag.created')
    expect(delivery).toBeTruthy()
    expect((delivery!.body as { flag: { key: string } }).flag.key).toBe('my-flag')
    expect(delivery!.headers['x-flaghoist-event']).toBe('flag.created')
    expect(delivery!.headers['x-flaghoist-signature']).toMatch(/^sha256=/)

    vi.unstubAllGlobals()
  })

  it('does not fire for disabled webhooks', async () => {
    const app = makeServer()
    let called = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('example.com')) called = true
        return new Response('OK', { status: 200 })
      }),
    )

    await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://example.com/hook', enabled: false }),
    })

    await app.request('/api/v1/flags/my-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(called).toBe(false)

    vi.unstubAllGlobals()
  })

  it('does not fire when the event is not subscribed', async () => {
    const app = makeServer()
    let called = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('example.com')) called = true
        return new Response('OK', { status: 200 })
      }),
    )

    await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://example.com/hook', events: ['flag.deleted'] }),
    })

    await app.request('/api/v1/flags/my-flag', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(called).toBe(false)

    vi.unstubAllGlobals()
  })
})
