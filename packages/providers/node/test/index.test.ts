import { OFREPProvider } from '@openfeature/ofrep-provider'
import { ErrorCode, OpenFeature } from '@openfeature/server-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlaghoistProvider } from '../src/index'

const URL_BASE = 'https://flags.example.com'

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** A fetch that answers the bulk endpoint with these flags and records every request. */
function fakeServer(flags: Record<string, boolean>) {
  const requests: { url: string; body: unknown; headers: Headers }[] = []
  const fetch = vi.fn(async (input: Request | string | URL) => {
    const req = input as Request
    requests.push({ url: req.url, body: await req.json(), headers: req.headers })
    if (new URL(req.url).pathname === '/ofrep/v1/evaluate/flags') {
      return json({
        flags: Object.entries(flags).map(([key, value]) => ({
          key,
          value,
          reason: 'TARGETING_MATCH',
          variant: value ? 'on' : 'off',
        })),
      })
    }
    const key = decodeURIComponent(req.url.split('/').pop() ?? '')
    if (!(key in flags)) return json({ key, errorCode: 'FLAG_NOT_FOUND' }, 404)
    return json({ key, value: flags[key], reason: 'TARGETING_MATCH', variant: 'on' })
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests }
}

afterEach(async () => {
  vi.useRealTimers()
  await OpenFeature.close()
})

describe('FlaghoistProvider', () => {
  it('constructs as an OFREP provider with provider metadata', () => {
    const provider = new FlaghoistProvider({ url: URL_BASE, apiKey: 'read-key' })
    expect(provider).toBeInstanceOf(OFREPProvider)
    expect(typeof provider.metadata.name).toBe('string')
  })

  it('answers several checks for one context with a single bulk request', async () => {
    const server = fakeServer({
      'new-checkout': true,
      'express-shipping': false,
      'gift-wrap': true,
    })
    const provider = new FlaghoistProvider({
      url: URL_BASE,
      apiKey: 'read-key',
      fetchImplementation: server.fetch,
    })
    const ctx = { targetingKey: 'user-1', plan: 'pro' }

    const [a, b, c] = await Promise.all([
      provider.resolveBooleanEvaluation('new-checkout', false, ctx),
      provider.resolveBooleanEvaluation('express-shipping', true, ctx),
      provider.resolveBooleanEvaluation('gift-wrap', false, ctx),
    ])
    expect([a.value, b.value, c.value]).toEqual([true, false, true])
    // Sequential checks reuse the result too.
    expect((await provider.resolveBooleanEvaluation('new-checkout', false, ctx)).value).toBe(true)

    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.url).toBe(`${URL_BASE}/ofrep/v1/evaluate/flags`)
    expect(server.requests[0]?.body).toEqual({ context: ctx })
    expect(server.requests[0]?.headers.get('x-api-key')).toBe('read-key')
  })

  it('works through the OpenFeature client', async () => {
    const server = fakeServer({ 'new-checkout': true, 'gift-wrap': false })
    await OpenFeature.setProviderAndWait(
      new FlaghoistProvider({ url: URL_BASE, fetchImplementation: server.fetch }),
    )
    const client = OpenFeature.getClient()
    const ctx = { targetingKey: 'user-1' }
    expect(await client.getBooleanValue('new-checkout', false, ctx)).toBe(true)
    expect(await client.getBooleanValue('gift-wrap', true, ctx)).toBe(false)
    expect(server.requests).toHaveLength(1)
  })

  it('treats contexts with the same attributes in a different order as the same context', async () => {
    const server = fakeServer({ a: true })
    const provider = new FlaghoistProvider({ url: URL_BASE, fetchImplementation: server.fetch })
    await provider.resolveBooleanEvaluation('a', false, { targetingKey: 'u', plan: 'pro' })
    await provider.resolveBooleanEvaluation('a', false, { plan: 'pro', targetingKey: 'u' })
    expect(server.requests).toHaveLength(1)
  })

  it('makes a separate request for a different context', async () => {
    const server = fakeServer({ a: true })
    const provider = new FlaghoistProvider({ url: URL_BASE, fetchImplementation: server.fetch })
    await provider.resolveBooleanEvaluation('a', false, { targetingKey: 'user-1' })
    await provider.resolveBooleanEvaluation('a', false, { targetingKey: 'user-2' })
    expect(server.requests).toHaveLength(2)
  })

  it('fetches again once the cached result expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const server = fakeServer({ a: true })
    const provider = new FlaghoistProvider({
      url: URL_BASE,
      fetchImplementation: server.fetch,
      cacheTtlMs: 1000,
    })
    const ctx = { targetingKey: 'u' }
    await provider.resolveBooleanEvaluation('a', false, ctx)
    vi.advanceTimersByTime(999)
    await provider.resolveBooleanEvaluation('a', false, ctx)
    expect(server.requests).toHaveLength(1)
    vi.advanceTimersByTime(2)
    await provider.resolveBooleanEvaluation('a', false, ctx)
    expect(server.requests).toHaveLength(2)
  })

  it('reports a flag the server does not have as FLAG_NOT_FOUND with the default', async () => {
    const server = fakeServer({ a: true })
    const provider = new FlaghoistProvider({ url: URL_BASE, fetchImplementation: server.fetch })
    const result = await provider.resolveBooleanEvaluation('missing', true, { targetingKey: 'u' })
    expect(result.value).toBe(true)
    expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND)
  })

  it('returns the default on a server error and does not cache the failure', async () => {
    let fail = true
    const fetch = vi.fn(async () =>
      fail
        ? json({ errorCode: 'GENERAL', errorDetails: 'storage unavailable' }, 500)
        : json({ flags: [{ key: 'a', value: true, reason: 'STATIC' }] }),
    ) as unknown as typeof globalThis.fetch
    const provider = new FlaghoistProvider({ url: URL_BASE, fetchImplementation: fetch })
    const ctx = { targetingKey: 'u' }

    const failed = await provider.resolveBooleanEvaluation('a', false, ctx)
    expect(failed.value).toBe(false)
    expect(failed.errorCode).toBe(ErrorCode.GENERAL)

    fail = false
    expect((await provider.resolveBooleanEvaluation('a', false, ctx)).value).toBe(true)
  })

  it('stops calling the server until Retry-After passes once rate limited', async () => {
    const fetch = vi.fn(async () =>
      json({ error: 'Too many requests' }, 429, { 'retry-after': '30' }),
    ) as unknown as typeof globalThis.fetch
    await OpenFeature.setProviderAndWait(
      new FlaghoistProvider({ url: URL_BASE, fetchImplementation: fetch }),
    )
    const client = OpenFeature.getClient()
    expect(await client.getBooleanValue('a', true, { targetingKey: 'u' })).toBe(true)
    expect(await client.getBooleanValue('b', true, { targetingKey: 'v' })).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps at most maxCachedContexts contexts, dropping the oldest', async () => {
    const server = fakeServer({ a: true })
    const provider = new FlaghoistProvider({
      url: URL_BASE,
      fetchImplementation: server.fetch,
      maxCachedContexts: 2,
    })
    for (const user of ['u1', 'u2', 'u3']) {
      await provider.resolveBooleanEvaluation('a', false, { targetingKey: user })
    }
    await provider.resolveBooleanEvaluation('a', false, { targetingKey: 'u3' })
    expect(server.requests).toHaveLength(3)
    await provider.resolveBooleanEvaluation('a', false, { targetingKey: 'u1' })
    expect(server.requests).toHaveLength(4)
  })

  it('makes one request per check with bulk turned off', async () => {
    const server = fakeServer({ a: true, b: false })
    const provider = new FlaghoistProvider({
      url: URL_BASE,
      fetchImplementation: server.fetch,
      bulk: false,
    })
    const ctx = { targetingKey: 'u' }
    expect((await provider.resolveBooleanEvaluation('a', false, ctx)).value).toBe(true)
    expect((await provider.resolveBooleanEvaluation('b', true, ctx)).value).toBe(false)
    expect(server.requests.map((r) => r.url)).toEqual([
      `${URL_BASE}/ofrep/v1/evaluate/flags/a`,
      `${URL_BASE}/ofrep/v1/evaluate/flags/b`,
    ])
  })

  it('passes headersFactory and query through to the bulk request', async () => {
    const server = fakeServer({ a: true })
    const provider = new FlaghoistProvider({
      url: URL_BASE,
      apiKey: 'read-key',
      fetchImplementation: server.fetch,
      headersFactory: async () => [['x-request-id', 'abc']],
      query: new URLSearchParams({ region: 'eu' }),
    })
    await provider.resolveBooleanEvaluation('a', false, { targetingKey: 'u' })
    expect(server.requests[0]?.url).toBe(`${URL_BASE}/ofrep/v1/evaluate/flags?region=eu`)
    expect(server.requests[0]?.headers.get('x-request-id')).toBe('abc')
    expect(server.requests[0]?.headers.get('x-api-key')).toBe('read-key')
  })
})
