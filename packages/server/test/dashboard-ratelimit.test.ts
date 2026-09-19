import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

describe('dashboard rate limit', () => {
  it('allows normal traffic and blocks excessive requests', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      auth: { admin: bearerToken('s'), read: apiKey('r') },
      dashboard: '<!doctype html><p>dashboard',
    })

    for (let i = 0; i < 30; i++) {
      const res = await app.request('/admin')
      expect(res.status).toBe(200)
    }

    const blocked = await app.request('/admin')
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBeTruthy()
  })

  it('applies independently of the API rate limiter', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      auth: { admin: bearerToken('s'), read: apiKey('r') },
      dashboard: '<!doctype html><p>dashboard',
    })

    for (let i = 0; i < 30; i++) {
      await app.request('/admin')
    }

    const apiRes = await app.request('/health')
    expect(apiRes.status).toBe(200)
  })
})
