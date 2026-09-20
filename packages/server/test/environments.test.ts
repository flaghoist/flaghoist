import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it, vi } from 'vitest'
import { apiKey, apiKeys, bearerToken, createFlagServer } from '../src/index'

const adminHeaders = { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }

function stagingHeaders(): Record<string, string> {
  return { ...adminHeaders, 'x-flaghoist-environment': 'staging' }
}

function makeMultiEnvServer(storage = memoryAdapter()) {
  return createFlagServer({
    storage,
    environments: ['production', 'staging', 'development'],
    auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
  })
}

describe('environments: admin scoping', () => {
  it('isolates the same key across two environments', async () => {
    const app = makeMultiEnvServer()

    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })
    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: stagingHeaders(),
      body: JSON.stringify({ enabled: false, rollout: { percentage: 0 } }),
    })

    const prodFlag = (await (
      await app.request('/api/v1/flags/checkout', { headers: adminHeaders })
    ).json()) as { enabled: boolean }
    const stagingFlag = (await (
      await app.request('/api/v1/flags/checkout', { headers: stagingHeaders() })
    ).json()) as { enabled: boolean }

    expect(prodFlag.enabled).toBe(true)
    expect(stagingFlag.enabled).toBe(false)
  })

  it('lists only the flags belonging to the requested environment', async () => {
    const app = makeMultiEnvServer()
    await app.request('/api/v1/flags/prod-only', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })
    await app.request('/api/v1/flags/staging-only', {
      method: 'PUT',
      headers: stagingHeaders(),
      body: JSON.stringify({ enabled: true }),
    })

    const prodList = (await (
      await app.request('/api/v1/flags', { headers: adminHeaders })
    ).json()) as { flags: { key: string }[] }
    const stagingList = (await (
      await app.request('/api/v1/flags', { headers: stagingHeaders() })
    ).json()) as { flags: { key: string }[] }

    expect(prodList.flags.map((f) => f.key)).toEqual(['prod-only'])
    expect(stagingList.flags.map((f) => f.key)).toEqual(['staging-only'])
  })

  it('omitting the environment header maps to the default environment', async () => {
    const app = makeMultiEnvServer()
    await app.request('/api/v1/flags/k', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })
    const withDefaultHeader = { ...adminHeaders, 'x-flaghoist-environment': 'production' }
    const res = await app.request('/api/v1/flags/k', { headers: withDefaultHeader })
    expect(res.status).toBe(200)
  })

  it('rejects an unknown environment with 400', async () => {
    const app = makeMultiEnvServer()
    const res = await app.request('/api/v1/flags', {
      headers: { ...adminHeaders, 'x-flaghoist-environment': 'nope' },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/unknown environment/i)
  })

  it('a flag created before environments were configured is already the default environment', async () => {
    const storage = memoryAdapter()
    const preExisting = createFlagServer({
      storage,
      auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
    })
    await preExisting.request('/api/v1/flags/legacy', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })

    const withEnvs = makeMultiEnvServer(storage)
    const res = await withEnvs.request('/api/v1/flags/legacy', { headers: adminHeaders })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { key: string }).key).toBe('legacy')

    const stagingRes = await withEnvs.request('/api/v1/flags/legacy', {
      headers: stagingHeaders(),
    })
    expect(stagingRes.status).toBe(404)
  })

  it('a server without environments configured ignores the environment header entirely', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
    })
    await app.request('/api/v1/flags/k', {
      method: 'PUT',
      headers: { ...adminHeaders, 'x-flaghoist-environment': 'staging' },
      body: JSON.stringify({ enabled: true }),
    })
    const res = await app.request('/api/v1/flags/k', { headers: adminHeaders })
    expect(res.status).toBe(200)
  })
})

describe('environments: GET /environments', () => {
  it('reports configured environments and the default', async () => {
    const app = makeMultiEnvServer()
    const res = await app.request('/api/v1/environments', { headers: adminHeaders })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { environments: string[]; default: string }
    expect(body.environments).toEqual(['production', 'staging', 'development'])
    expect(body.default).toBe('production')
  })

  it('reports a single default environment when none are configured', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
    })
    const res = await app.request('/api/v1/environments', { headers: adminHeaders })
    const body = (await res.json()) as { environments: string[]; default: string }
    expect(body.environments).toEqual(['production'])
    expect(body.default).toBe('production')
  })
})

describe('environments: read path (OFREP)', () => {
  function makeReadServer() {
    return createFlagServer({
      storage: memoryAdapter(),
      environments: ['production', 'staging'],
      auth: {
        admin: bearerToken('admin-secret'),
        read: apiKeys({ production: 'prod-read-key', staging: 'staging-read-key' }),
      },
    })
  }

  it('a per-environment read key only sees its own environment', async () => {
    const app = makeReadServer()
    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })
    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: stagingHeaders(),
      body: JSON.stringify({ enabled: false, rollout: { percentage: 0 } }),
    })

    const prodEval = await app.request('/ofrep/v1/evaluate/flags/checkout', {
      method: 'POST',
      headers: { 'x-api-key': 'prod-read-key', 'content-type': 'application/json' },
      body: JSON.stringify({ context: {} }),
    })
    const stagingEval = await app.request('/ofrep/v1/evaluate/flags/checkout', {
      method: 'POST',
      headers: { 'x-api-key': 'staging-read-key', 'content-type': 'application/json' },
      body: JSON.stringify({ context: {} }),
    })

    expect(((await prodEval.json()) as { value: boolean }).value).toBe(true)
    expect(((await stagingEval.json()) as { value: boolean }).value).toBe(false)
  })

  it('a wrong-environment read key is rejected outright', async () => {
    const app = makeReadServer()
    const res = await app.request('/ofrep/v1/evaluate/flags/checkout', {
      method: 'POST',
      headers: { 'x-api-key': 'not-a-real-key', 'content-type': 'application/json' },
      body: JSON.stringify({ context: {} }),
    })
    expect(res.status).toBe(401)
  })

  it('a plain single-secret apiKey() always maps to the default environment', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      environments: ['production', 'staging'],
      auth: { admin: bearerToken('admin-secret'), read: apiKey('shared-read-key') },
    })
    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })
    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: stagingHeaders(),
      body: JSON.stringify({ enabled: false }),
    })

    const res = await app.request('/ofrep/v1/evaluate/flags/checkout', {
      method: 'POST',
      headers: { 'x-api-key': 'shared-read-key', 'content-type': 'application/json' },
      body: JSON.stringify({ context: {} }),
    })
    expect(((await res.json()) as { value: boolean }).value).toBe(true)
  })
})

describe('environments: audit trail', () => {
  it('stamps and filters audit entries by environment', async () => {
    const app = makeMultiEnvServer()
    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })
    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: stagingHeaders(),
      body: JSON.stringify({ enabled: true }),
    })

    const prodAudit = (await (
      await app.request('/api/v1/audit', { headers: adminHeaders })
    ).json()) as { entries: { flagKey: string }[]; total: number }
    const stagingAudit = (await (
      await app.request('/api/v1/audit', { headers: stagingHeaders() })
    ).json()) as { entries: { flagKey: string }[]; total: number }

    expect(prodAudit.total).toBe(1)
    expect(stagingAudit.total).toBe(1)
  })
})

describe('environments: webhook payload', () => {
  it('names the environment a change happened in', async () => {
    const app = makeMultiEnvServer()
    const received: { body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('example.com')) {
          received.push({ body: JSON.parse(init?.body as string) })
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
    await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: stagingHeaders(),
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })

    await new Promise((r) => setTimeout(r, 50))

    const delivery = received.find((r) => (r.body as { event: string }).event === 'flag.created')
    expect(delivery).toBeTruthy()
    expect((delivery!.body as { environment?: string }).environment).toBe('staging')

    vi.unstubAllGlobals()
  })
})
