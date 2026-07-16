import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const auth = { admin: bearerToken('a'), read: apiKey('r') }

describe('admin dashboard serving', () => {
  it('serves the configured dashboard HTML at /admin', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      auth,
      dashboard: '<!doctype html><title>UI</title>',
    })
    const res = await app.request('/admin')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('<title>UI</title>')
  })

  it('serves the SPA for deep links under /admin/*', async () => {
    const app = createFlagServer({ storage: memoryAdapter(), auth, dashboard: '<html>ok</html>' })
    expect((await app.request('/admin/flags/new-checkout')).status).toBe(200)
  })

  it('404s when no dashboard is configured', async () => {
    const app = createFlagServer({ storage: memoryAdapter(), auth })
    expect((await app.request('/admin')).status).toBe(404)
  })
})
