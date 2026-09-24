import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createAdminClient } from '../src/index'

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl as typeof fetch)
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => vi.unstubAllGlobals())

/** Issue #30: callers must have exactly one error shape to handle. */
describe('one error model (#30)', () => {
  it('turns a network failure into an ApiError rather than a TypeError', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const err = await createAdminClient({ url: 'https://x.dev', token: 't' })
      .list()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(0)
  })

  it('turns a timeout into an ApiError', async () => {
    stubFetch(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    const err = await createAdminClient({ url: 'https://x.dev', token: 't' })
      .list()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(408)
  })

  it('turns a non-JSON success body into an ApiError', async () => {
    stubFetch(async () => new Response('<html>hello</html>', { status: 200 }))
    const err = await createAdminClient({ url: 'https://x.dev', token: 't' })
      .list()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(502)
  })

  it('carries the server error code, so a role refusal is distinguishable', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: 'This needs the admin role or higher.',
            code: 'insufficient_role',
          }),
          { status: 403 },
        ),
    )
    const err = (await createAdminClient({ url: 'https://x.dev', token: 't' })
      .delete('checkout')
      .catch((e: unknown) => e)) as ApiError
    expect(err.status).toBe(403)
    expect(err.message).toBe('This needs the admin role or higher.')
    expect(err.code).toBe('insufficient_role')
  })

  it('leaves the code unset when the server sends none', async () => {
    stubFetch(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 401 }))
    const err = (await createAdminClient({ url: 'https://x.dev', token: 't' })
      .list()
      .catch((e: unknown) => e)) as ApiError
    expect(err.status).toBe(401)
    expect(err.code).toBeUndefined()
  })
})
