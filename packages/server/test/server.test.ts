import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

function makeServer(allowedOrigins?: string[]) {
  return createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken('a'), read: apiKey('read-key') },
    allowedOrigins,
  })
}

describe('health', () => {
  it('responds ok without auth', async () => {
    const res = await makeServer().request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

describe('CORS', () => {
  it('reflects an allowed origin and answers preflight with 204', async () => {
    const app = makeServer(['https://app.example.com'])
    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.example.com' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
  })

  it('does not reflect a disallowed origin', async () => {
    const app = makeServer(['https://app.example.com'])
    const res = await app.request('/health', { headers: { Origin: 'https://evil.example.com' } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('body limits', () => {
  it('rejects an oversized read body with 413', async () => {
    const app = makeServer()
    const big = JSON.stringify({ context: { blob: 'x'.repeat(70 * 1024) } })
    const res = await app.request('/ofrep/v1/evaluate/flags', {
      method: 'POST',
      headers: { 'x-api-key': 'read-key', 'content-type': 'application/json' },
      body: big,
    })
    expect(res.status).toBe(413)
  })
})
