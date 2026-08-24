import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const auth = { admin: bearerToken('a'), read: apiKey('r') }

describe('OpenAPI document exposure', () => {
  it('serves the document by default', async () => {
    const app = createFlagServer({ storage: memoryAdapter(), auth })
    const res = await app.request('/api/v1/openapi.json')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { openapi: string }).openapi).toBe('3.1.0')
  })

  it('404s when exposeOpenApi is false', async () => {
    const app = createFlagServer({ storage: memoryAdapter(), auth, exposeOpenApi: false })
    expect((await app.request('/api/v1/openapi.json')).status).toBe(404)
  })
})
