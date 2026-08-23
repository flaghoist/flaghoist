import { memoryAdapter } from '@flaghoist/adapter-memory'
import { createFlag } from '@flaghoist/core'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const readHeaders = { 'x-api-key': 'read-key', 'content-type': 'application/json' }

function makeServer() {
  const storage = memoryAdapter([
    createFlag({ key: 'on-flag', enabled: true, rollout: { percentage: 100 } }),
    createFlag({ key: 'off-flag', enabled: false, rollout: { percentage: 100 } }),
    createFlag({
      key: 'beta',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
          result: { enabled: true },
        },
      ],
    }),
  ])
  return createFlagServer({
    storage,
    auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
  })
}

describe('OFREP bulk evaluate', () => {
  it('evaluates all flags for a context', async () => {
    const res = await makeServer().request('/ofrep/v1/evaluate/flags', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: { targetingKey: 'u1', plan: 'beta' } }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { flags: Array<{ key: string; value: boolean }> }
    const values = Object.fromEntries(body.flags.map((f) => [f.key, f.value]))
    expect(values['on-flag']).toBe(true)
    expect(values['off-flag']).toBe(false)
    expect(values['beta']).toBe(true) // plan=beta matches the targeting rule
  })

  it('rejects a missing API key with 401', async () => {
    const res = await makeServer().request('/ofrep/v1/evaluate/flags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: {} }),
    })
    expect(res.status).toBe(401)
  })
})

describe('OFREP single evaluate', () => {
  it('evaluates one flag with a reason', async () => {
    const res = await makeServer().request('/ofrep/v1/evaluate/flags/beta', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: { targetingKey: 'u', plan: 'beta' } }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ key: 'beta', value: true, reason: 'TARGETING_MATCH' })
  })

  it('returns FLAG_NOT_FOUND (404) for an unknown flag', async () => {
    const res = await makeServer().request('/ofrep/v1/evaluate/flags/nope', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: {} }),
    })
    expect(res.status).toBe(404)
    expect(((await res.json()) as { errorCode: string }).errorCode).toBe('FLAG_NOT_FOUND')
  })

  it('lets trusted context override client-supplied attributes', async () => {
    const storage = memoryAdapter([
      createFlag({
        key: 'beta',
        enabled: true,
        rollout: { percentage: 0 },
        rules: [
          {
            conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
            result: { enabled: true },
          },
        ],
      }),
    ])
    const app = createFlagServer({
      storage,
      auth: { admin: bearerToken('a'), read: apiKey('read-key') },
      trustedContext: () => ({ plan: 'beta' }),
    })
    // The client asserts plan=free, but the trusted override forces plan=beta → rule matches.
    const res = await app.request('/ofrep/v1/evaluate/flags/beta', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: { targetingKey: 'u', plan: 'free' } }),
    })
    expect(((await res.json()) as { value: boolean }).value).toBe(true)
  })
})

describe('OFREP reason for a disabled flag', () => {
  // OpenFeature clients read DISABLED as "use the default you passed in". The Go OFREP provider
  // acts on that and discards our value, so a kill switch written as BooleanValue(key, true) kept
  // serving a feature after it was switched off, while JavaScript honoured the false. STATIC says
  // the value is not the product of dynamic evaluation without inviting substitution.
  it('reports STATIC rather than DISABLED, so every provider honours the value', async () => {
    const app = makeServer()
    const res = await app.request('/ofrep/v1/evaluate/flags', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: { targetingKey: 'u1' } }),
    })
    const body = (await res.json()) as { flags: { key: string; value: boolean; reason: string }[] }
    const off = body.flags.find((f) => f.key === 'off-flag')

    expect(off?.value).toBe(false)
    expect(off?.reason).toBe('STATIC')
    expect(off?.reason).not.toBe('DISABLED')
  })

  it('maps the single-flag endpoint the same way', async () => {
    const app = makeServer()
    const res = await app.request('/ofrep/v1/evaluate/flags/off-flag', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: { targetingKey: 'u1' } }),
    })
    const body = (await res.json()) as { value: boolean; reason: string }

    expect(body.value).toBe(false)
    expect(body.reason).toBe('STATIC')
  })

  it('leaves every other reason untouched', async () => {
    const app = makeServer()
    const res = await app.request('/ofrep/v1/evaluate/flags', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: { targetingKey: 'u1', plan: 'beta' } }),
    })
    const body = (await res.json()) as { flags: { key: string; reason: string }[] }

    expect(body.flags.find((f) => f.key === 'beta')?.reason).toBe('TARGETING_MATCH')
    expect(body.flags.find((f) => f.key === 'on-flag')?.reason).toBe('DEFAULT')
  })
})
