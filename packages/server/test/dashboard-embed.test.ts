import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { dashboardHtml } from '../src/dashboard'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

describe('embedded dashboard build', () => {
  it('is a complete HTML document', () => {
    expect(dashboardHtml.trimStart()).toMatch(/^<!doctype html>/i)
    expect(dashboardHtml).toContain('<title>Flaghoist admin</title>')
    expect(dashboardHtml).toContain('<div id="app">')
  })

  it('is self-contained, so a Worker with no network egress can serve it', () => {
    // The single-file build must inline every asset. An external reference here means the
    // dashboard would silently depend on a third party at runtime, which is how the admin
    // console ended up fetching fonts from Google.
    expect(dashboardHtml).not.toMatch(/<script[^>]*\ssrc=/i)
    expect(dashboardHtml).not.toMatch(/<link[^>]*\shref=/i)
    expect(dashboardHtml).not.toContain('fonts.googleapis.com')
    expect(dashboardHtml).not.toContain('fonts.gstatic.com')
  })

  it('stays well under the 3MB Worker bundle limit', () => {
    expect(new TextEncoder().encode(dashboardHtml).byteLength).toBeLessThan(1_000_000)
  })

  it('is what a server configured with it actually serves at /admin', async () => {
    const app = createFlagServer({
      storage: memoryAdapter(),
      auth: { admin: bearerToken('a'), read: apiKey('r') },
      dashboard: dashboardHtml,
    })
    const res = await app.request('/admin')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toBe(dashboardHtml)
  })
})
