import { describe, expect, it } from 'vitest'
import { ApiError, createAdminClient, flagState, type FeatureFlag } from '../src/api'

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

// Use the injectable fetch so these tests do not depend on global patching behavior.
function makeClient(impl: (url: string, init?: RequestInit) => Promise<Response>, url = 'https://x.dev') {
  return createAdminClient({ url, token: 't', fetch: impl })
}

describe('request wiring', () => {
  it('calls the versioned admin path with a bearer token', async () => {
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    const client = makeClient(async (url, init) => {
      capturedUrl = url
      capturedInit = init
      return json({ flags: [flag()] })
    }, 'https://flags.example.com')
    await client.list()

    expect(capturedUrl).toBe('https://flags.example.com/api/v1/flags')
    expect((capturedInit?.headers as Record<string, string>).authorization).toBe('Bearer t')
  })

  it('strips trailing slashes from the base URL', async () => {
    let capturedUrl: string | undefined
    const client = createAdminClient({
      url: 'https://flags.example.com///',
      token: 't',
      fetch: async (url) => {
        capturedUrl = url
        return json({ flags: [] })
      },
    })
    await client.list()
    expect(capturedUrl).toBe('https://flags.example.com/api/v1/flags')
  })

  it('percent-encodes keys so a slash cannot escape the path', async () => {
    let capturedUrl: string | undefined
    const client = makeClient(async (url) => {
      capturedUrl = url
      return json(flag({ key: 'a/b' }))
    })
    await client.put('a/b', { enabled: true, rollout: { percentage: 0 } })
    expect(capturedUrl).toBe('https://x.dev/api/v1/flags/a%2Fb')
  })
})

/** Issue #29: the operator should see the server's own explanation, not a bare status line. */
describe('server error messages (#29)', () => {
  it('surfaces the error field from a JSON error body', async () => {
    const client = makeClient(async () => json({ error: 'admin token has been revoked' }, 401))
    await expect(client.list()).rejects.toMatchObject({
      status: 401,
      message: 'admin token has been revoked',
    })
  })

  it('falls back to a message field', async () => {
    const client = makeClient(async () => json({ message: 'rollout must be 0-100' }, 400))
    await expect(client.list()).rejects.toMatchObject({
      message: 'rollout must be 0-100',
    })
  })

  it('falls back to raw text when the body is not JSON', async () => {
    const client = makeClient(async () => new Response('upstream exploded', { status: 500 }))
    await expect(client.list()).rejects.toMatchObject({
      status: 500,
      message: 'upstream exploded',
    })
  })

  it('falls back to status text when the body is empty', async () => {
    const client = makeClient(
      async () => new Response('', { status: 503, statusText: 'Service Unavailable' }),
    )
    await expect(client.list()).rejects.toMatchObject({
      message: 'Service Unavailable',
    })
  })

  it('does not let a huge body run away with the UI', async () => {
    const client = makeClient(async () => new Response('x'.repeat(5000), { status: 500 }))
    const err = await client.list().catch((e: ApiError) => e)
    expect((err as ApiError).message.length).toBeLessThanOrEqual(300)
  })
})

describe('response shape', () => {
  it('drops entries that do not match the flag shape rather than rendering junk', async () => {
    const client = makeClient(async () => json({ flags: [flag(), { key: 'broken' }, null] }))
    const flags = await client.list()
    expect(flags).toHaveLength(1)
    expect(flags[0].key).toBe('checkout-v2')
  })

  it('rejects a malformed flag list', async () => {
    const client = makeClient(async () => json({ flags: 'not-an-array' }))
    await expect(client.list()).rejects.toBeInstanceOf(ApiError)
  })

  it('rejects a malformed saved flag', async () => {
    const client = makeClient(async () => json({ key: 'x' })) // missing enabled/rollout/metadata
    await expect(
      client.put('x', { enabled: true, rollout: { percentage: 0 } }),
    ).rejects.toMatchObject({ status: 502 })
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
