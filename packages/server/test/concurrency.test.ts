import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const auth = { admin: bearerToken('admin'), read: apiKey('read') }
const H: Record<string, string> = {
  authorization: 'Bearer admin',
  'content-type': 'application/json',
}

function app() {
  return createFlagServer({ storage: memoryAdapter(), auth })
}

function put(
  a: ReturnType<typeof app>,
  key: string,
  input: object,
  headers: Record<string, string> = {},
) {
  return a.request(`/api/v1/flags/${key}`, {
    method: 'PUT',
    headers: { ...H, ...headers },
    body: JSON.stringify(input),
  })
}

describe('optimistic concurrency (If-Match)', () => {
  it('accepts a write with no If-Match, staying last-write-wins for existing clients', async () => {
    const a = app()
    const res = await put(a, 'f', { enabled: true, rollout: { percentage: 100 } })
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBeTruthy()
  })

  it('accepts a write whose If-Match matches the current version, and moves the ETag on', async () => {
    const a = app()
    const first = await put(a, 'f', { enabled: true, rollout: { percentage: 100 } })
    const etag = first.headers.get('ETag')!
    const res = await put(
      a,
      'f',
      { enabled: false, rollout: { percentage: 0 } },
      { 'If-Match': etag },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).not.toBe(etag)
  })

  it('rejects a stale If-Match with 412 and preserves the intervening write', async () => {
    const a = app()
    const first = await put(a, 'f', { enabled: true, rollout: { percentage: 100 } })
    const stale = first.headers.get('ETag')!
    // Someone else writes (no If-Match), moving the version on.
    await put(a, 'f', { enabled: true, rollout: { percentage: 50 } })
    // Our write, still holding the old tag, is refused.
    const res = await put(
      a,
      'f',
      { enabled: false, rollout: { percentage: 0 } },
      { 'If-Match': stale },
    )
    expect(res.status).toBe(412)
    // The flag still reflects the intervening write, not our clobber.
    const flag = (await (await a.request('/api/v1/flags/f', { headers: H })).json()) as {
      rollout: { percentage: number }
    }
    expect(flag.rollout.percentage).toBe(50)
  })

  it('treats If-Match: * as "must still exist"', async () => {
    const a = app()
    const miss = await put(
      a,
      'f',
      { enabled: true, rollout: { percentage: 100 } },
      { 'If-Match': '*' },
    )
    expect(miss.status).toBe(412) // nothing to match yet
    await put(a, 'f', { enabled: true, rollout: { percentage: 100 } })
    const hit = await put(
      a,
      'f',
      { enabled: false, rollout: { percentage: 0 } },
      { 'If-Match': '*' },
    )
    expect(hit.status).toBe(200)
  })

  it('keeps updatedAt strictly increasing across rapid writes to one key', async () => {
    const a = app()
    const stamps: string[] = []
    for (let i = 0; i < 6; i++) {
      const res = await put(a, 'f', { enabled: i % 2 === 0, rollout: { percentage: i } })
      stamps.push(((await res.json()) as { metadata: { updatedAt: string } }).metadata.updatedAt)
    }
    expect(stamps).toEqual([...stamps].sort()) // monotonic
    expect(new Set(stamps).size).toBe(stamps.length) // all distinct, even same-millisecond writes
  })

  it('returns an ETag on GET', async () => {
    const a = app()
    await put(a, 'f', { enabled: true, rollout: { percentage: 100 } })
    const get = await a.request('/api/v1/flags/f', { headers: H })
    expect(get.headers.get('ETag')).toMatch(/^".+"$/)
  })
})
