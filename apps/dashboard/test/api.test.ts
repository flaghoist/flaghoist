import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApi, flagState, type FeatureFlag } from '../src/api'

const flag = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  key: 'checkout-v2',
  enabled: true,
  rollout: { percentage: 25 },
  description: 'Redesigned checkout',
  metadata: {
    createdBy: 'admin',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedBy: 'admin',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
  ...over,
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl as typeof fetch)
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => vi.unstubAllGlobals())

describe('request wiring', () => {
  it('calls the versioned admin path with a bearer token', async () => {
    const spy = stubFetch(async () => json({ flags: [flag()] }))
    await createApi('https://flags.example.com', 'sekret').list()

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://flags.example.com/api/v1/flags')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sekret')
  })

  it('strips trailing slashes from the base URL', async () => {
    const spy = stubFetch(async () => json({ flags: [] }))
    await createApi('https://flags.example.com///', 't').list()
    expect(spy.mock.calls[0][0]).toBe('https://flags.example.com/api/v1/flags')
  })

  it('percent-encodes keys so a slash cannot escape the path', async () => {
    const spy = stubFetch(async () => json(flag({ key: 'a/b' })))
    await createApi('https://x.dev', 't').save('a/b', { enabled: true, rollout: { percentage: 0 } })
    expect(spy.mock.calls[0][0]).toBe('https://x.dev/api/v1/flags/a%2Fb')
  })
})

/** Issue #29: the operator should see the server's own explanation, not a bare status line. */
describe('server error messages (#29)', () => {
  it('surfaces the error field from a JSON error body', async () => {
    stubFetch(async () => json({ error: 'admin token has been revoked' }, 401))
    await expect(createApi('https://x.dev', 't').list()).rejects.toMatchObject({
      status: 401,
      message: 'admin token has been revoked',
    })
  })

  it('falls back to a message field', async () => {
    stubFetch(async () => json({ message: 'rollout must be 0-100' }, 400))
    await expect(createApi('https://x.dev', 't').list()).rejects.toMatchObject({
      message: 'rollout must be 0-100',
    })
  })

  it('falls back to raw text when the body is not JSON', async () => {
    stubFetch(async () => new Response('upstream exploded', { status: 500 }))
    await expect(createApi('https://x.dev', 't').list()).rejects.toMatchObject({
      status: 500,
      message: 'upstream exploded',
    })
  })

  it('falls back to status text when the body is empty', async () => {
    stubFetch(async () => new Response('', { status: 503, statusText: 'Service Unavailable' }))
    await expect(createApi('https://x.dev', 't').list()).rejects.toMatchObject({
      message: 'Service Unavailable',
    })
  })

  it('does not let a huge body run away with the UI', async () => {
    stubFetch(async () => new Response('x'.repeat(5000), { status: 500 }))
    const err = await createApi('https://x.dev', 't')
      .list()
      .catch((e: ApiError) => e)
    expect((err as ApiError).message.length).toBeLessThanOrEqual(300)
  })
})

/** Issue #30: callers must have exactly one error shape to handle. */
describe('one error model (#30)', () => {
  it('turns a network failure into an ApiError rather than a TypeError', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const err = await createApi('https://x.dev', 't')
      .list()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(0)
  })

  it('turns a timeout into an ApiError', async () => {
    stubFetch(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    const err = await createApi('https://x.dev', 't')
      .list()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(408)
  })

  it('turns a non-JSON success body into an ApiError', async () => {
    stubFetch(async () => new Response('<html>hello</html>', { status: 200 }))
    const err = await createApi('https://x.dev', 't')
      .list()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(502)
  })

  it('rejects a malformed flag list', async () => {
    stubFetch(async () => json({ flags: 'not-an-array' }))
    await expect(createApi('https://x.dev', 't').list()).rejects.toBeInstanceOf(ApiError)
  })

  it('rejects a malformed saved flag', async () => {
    stubFetch(async () => json({ key: 'x' })) // missing enabled/rollout/metadata
    await expect(
      createApi('https://x.dev', 't').save('x', { enabled: true, rollout: { percentage: 0 } }),
    ).rejects.toMatchObject({ status: 502 })
  })
})

describe('list', () => {
  it('drops entries that do not match the flag shape rather than rendering junk', async () => {
    stubFetch(async () => json({ flags: [flag(), { key: 'broken' }, null] }))
    const flags = await createApi('https://x.dev', 't').list()
    expect(flags).toHaveLength(1)
    expect(flags[0].key).toBe('checkout-v2')
  })
})

describe('flagState', () => {
  it.each([
    [{ enabled: false, pct: 100 }, 'disabled'],
    [{ enabled: true, pct: 100 }, 'on'],
    [{ enabled: true, pct: 0 }, 'off'],
    [{ enabled: true, pct: 25 }, '25%'],
  ])('%o reads as %s', ({ enabled, pct }, label) => {
    expect(flagState(flag({ enabled, rollout: { percentage: pct } })).label).toBe(label)
  })
})
