import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer, memoryRateLimit } from '../src/index'

function server() {
  return createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken('admin'), read: apiKey('read') },
    rateLimit: memoryRateLimit({ max: 2, windowMs: 60_000 }),
  })
}

// Every request lands in the same bucket, since the test client sends no IP header (anonymous).
describe('rate limiting on the server', () => {
  it('returns 429 with Retry-After once the limit is exceeded', async () => {
    const app = server()
    const hit = () => app.request('/api/v1/flags', { headers: { authorization: 'Bearer admin' } })
    expect((await hit()).status).toBe(200)
    expect((await hit()).status).toBe(200)
    const limited = await hit()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()
    expect(await limited.json()).toEqual({ error: 'Too many requests' })
  })

  it('throttles credential guessing: a wrong token still counts toward the limit', async () => {
    const app = server()
    const guess = () => app.request('/api/v1/flags', { headers: { authorization: 'Bearer wrong' } })
    expect((await guess()).status).toBe(401)
    expect((await guess()).status).toBe(401)
    // Third attempt is rate limited before auth even runs.
    expect((await guess()).status).toBe(429)
  })

  it('never limits /health', async () => {
    const app = server()
    for (let i = 0; i < 5; i++) {
      expect((await app.request('/health')).status).toBe(200)
    }
  })

  it('does nothing when rateLimit is not configured', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      auth: { admin: bearerToken('admin'), read: apiKey('read') },
    })
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/api/v1/flags', { headers: { authorization: 'Bearer admin' } })
      expect(res.status).toBe(200)
    }
  })
})
