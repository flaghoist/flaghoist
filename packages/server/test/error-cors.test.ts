import { memoryAdapter } from '@flaghoist/adapter-memory'
import type { StorageAdapter } from '@flaghoist/core'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const auth = { admin: bearerToken('admin'), read: apiKey('read') }

describe('opaque error responses (F10)', () => {
  it('returns a flat 500 and never leaks the internal error to the client', async () => {
    // A storage backend that throws with a detail that must not reach the client.
    const exploding: StorageAdapter = {
      get: async () => null,
      put: async () => {
        throw new Error('SECRET connection string postgres://user:pw@host')
      },
      delete: async () => {},
      list: async () => {
        throw new Error('SECRET connection string postgres://user:pw@host')
      },
    }
    const app = createFlagServer({ storage: exploding, auth })
    const res = await app.request('/api/v1/flags', { headers: { authorization: 'Bearer admin' } })
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toBe(JSON.stringify({ error: 'Internal server error' }))
    expect(body).not.toContain('SECRET')
    expect(body).not.toContain('postgres://')
  })
})

describe('CORS credentials (F4)', () => {
  const app = createFlagServer({
    storage: memoryAdapter(),
    auth,
    allowedOrigins: ['https://app.example.com'],
  })

  it('allows an allowlisted origin without offering credentials', async () => {
    const res = await app.request('/health', { headers: { Origin: 'https://app.example.com' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull()
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('emits no CORS headers for an origin that is not allowlisted', async () => {
    const res = await app.request('/health', { headers: { Origin: 'https://evil.example.com' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('security headers', () => {
  const app = createFlagServer({ storage: memoryAdapter(), auth, dashboard: '<!doctype html><p>x' })

  const expectSecure = (res: Response) => {
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'")
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()')
  }

  it('sets them on a plain response', async () => {
    expectSecure(await app.request('/health'))
  })

  it('sets them on the admin dashboard, so it cannot be framed and clickjacked', async () => {
    const res = await app.request('/admin')
    expect(res.status).toBe(200)
    expectSecure(res)
  })

  it('sets them on an unauthorized API response, not just successful ones', async () => {
    const res = await app.request('/api/v1/flags') // no token: 401
    expect(res.status).toBe(401)
    expectSecure(res)
  })
})
