import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer, openApiDocument } from '../src/index'

const admin = { authorization: 'Bearer t', 'content-type': 'application/json' }

function makeServer() {
  return createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken('t'), read: apiKey('r') },
  })
}

describe('versioned admin API (/api/v1)', () => {
  it('serves admin CRUD under /api/v1/flags', async () => {
    const app = makeServer()
    expect((await app.request('/api/v1/flags', { headers: admin })).status).toBe(200)

    const put = await app.request('/api/v1/flags/checkout', {
      method: 'PUT',
      headers: admin,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })
    expect(put.status).toBe(200)

    const list = (await (await app.request('/api/v1/flags', { headers: admin })).json()) as {
      flags: unknown[]
    }
    expect(list.flags).toHaveLength(1)
  })

  it('requires admin auth on the versioned path', async () => {
    expect((await makeServer().request('/api/v1/flags')).status).toBe(401)
  })

  it('keeps the unversioned /flags path working as a legacy alias', async () => {
    const app = makeServer()
    await app.request('/api/v1/flags/k', {
      method: 'PUT',
      headers: admin,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 0 } }),
    })
    // Written via /api/v1, readable via the legacy alias — same storage, same handler.
    const res = await app.request('/flags/k', { headers: admin })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { key: string }).key).toBe('k')
  })
})

describe('OpenAPI document', () => {
  it('is served as JSON at /api/v1/openapi.json', async () => {
    const res = await makeServer().request('/api/v1/openapi.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')

    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> }
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.paths['/api/v1/flags']).toBeDefined()
    expect(doc.paths['/api/v1/flags/{key}']).toBeDefined()
  })

  it('is exported for tooling', () => {
    expect((openApiDocument as { openapi: string }).openapi).toBe('3.1.0')
  })
})
