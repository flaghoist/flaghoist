import { OFREPWebProvider } from '@openfeature/ofrep-web-provider'
import { OpenFeature } from '@openfeature/web-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlaghoistWebProvider } from '../src/index'

const URL_BASE = 'https://flags.example.com'

/** A fetch that answers the bulk endpoint and records each request. */
function fakeServer() {
  const requests: Request[] = []
  const fetch = vi.fn(async (input: Request | string | URL) => {
    requests.push(input as Request)
    return new Response(
      JSON.stringify({ flags: [{ key: 'new-checkout', value: true, reason: 'STATIC' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests }
}

afterEach(async () => {
  await OpenFeature.close()
  vi.useRealTimers()
})

describe('FlaghoistWebProvider', () => {
  it('constructs as an OFREP web provider with provider metadata', () => {
    const provider = new FlaghoistWebProvider({
      url: 'https://flags.example.com',
      apiKey: 'read-key',
    })
    expect(provider).toBeInstanceOf(OFREPWebProvider)
    expect(typeof provider.metadata.name).toBe('string')
  })

  it('sends the read key and extra headers to the bulk endpoint', async () => {
    const server = fakeServer()
    await OpenFeature.setProviderAndWait(
      new FlaghoistWebProvider({
        url: URL_BASE,
        apiKey: 'read-key',
        headers: { 'x-team': 'payments' },
        cacheMode: 'disabled',
        fetchImplementation: server.fetch,
      }),
    )
    expect(OpenFeature.getClient().getBooleanValue('new-checkout', false)).toBe(true)
    expect(server.requests[0]?.url).toBe(`${URL_BASE}/ofrep/v1/evaluate/flags`)
    expect(server.requests[0]?.headers.get('x-api-key')).toBe('read-key')
    expect(server.requests[0]?.headers.get('x-team')).toBe('payments')
  })

  it('does not poll by default, matching the upstream provider', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    await OpenFeature.setProviderAndWait(
      new FlaghoistWebProvider({
        url: URL_BASE,
        cacheMode: 'disabled',
        fetchImplementation: server.fetch,
      }),
    )
    await vi.advanceTimersByTimeAsync(120_000)
    expect(server.requests).toHaveLength(1)
  })

  it('passes pollInterval through, so flags refresh without a reload', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    await OpenFeature.setProviderAndWait(
      new FlaghoistWebProvider({
        url: URL_BASE,
        cacheMode: 'disabled',
        pollInterval: 30_000,
        fetchImplementation: server.fetch,
      }),
    )
    await vi.advanceTimersByTimeAsync(90_000)
    expect(server.requests.length).toBeGreaterThanOrEqual(3)
  })

  it('passes changeDetection through, so none turns polling off', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    await OpenFeature.setProviderAndWait(
      new FlaghoistWebProvider({
        url: URL_BASE,
        cacheMode: 'disabled',
        pollInterval: 30_000,
        changeDetection: 'none',
        fetchImplementation: server.fetch,
      }),
    )
    await vi.advanceTimersByTimeAsync(90_000)
    expect(server.requests).toHaveLength(1)
  })
})
