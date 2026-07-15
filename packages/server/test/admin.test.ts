import { memoryAdapter } from '@flaghoist/adapter-memory'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, createFlagServer } from '../src/index'

const adminHeaders = { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }
const readHeaders = { 'x-api-key': 'read-key', 'content-type': 'application/json' }

function makeServer() {
  return createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
  })
}

type StoredFlag = {
  key: string
  enabled: boolean
  rollout: { percentage: number }
  metadata: { createdBy: string; createdAt: string; updatedBy: string; updatedAt: string }
}

describe('admin auth', () => {
  it('rejects unauthenticated reads and writes with 401', async () => {
    const app = makeServer()
    expect((await app.request('/flags')).status).toBe(401)
    expect(
      (
        await app.request('/flags/x', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(401)
  })
})

describe('admin CRUD', () => {
  it('creates, reads, lists, and deletes a flag', async () => {
    const app = makeServer()

    let res = await app.request('/flags/new-checkout', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        enabled: true,
        rollout: { percentage: 50 },
        description: 'Redesigned checkout',
      }),
    })
    expect(res.status).toBe(200)
    const created = (await res.json()) as StoredFlag
    expect(created).toMatchObject({
      key: 'new-checkout',
      enabled: true,
      rollout: { percentage: 50 },
    })
    expect(created.metadata.createdBy).toBe('admin')

    res = await app.request('/flags/new-checkout', { headers: adminHeaders })
    expect(((await res.json()) as { key: string }).key).toBe('new-checkout')

    res = await app.request('/flags', { headers: adminHeaders })
    expect(((await res.json()) as { flags: unknown[] }).flags).toHaveLength(1)

    res = await app.request('/flags/new-checkout', { method: 'DELETE', headers: adminHeaders })
    expect(res.status).toBe(204)

    res = await app.request('/flags/new-checkout', { headers: adminHeaders })
    expect(res.status).toBe(404)
  })

  it('preserves creation metadata on update and stamps the updater', async () => {
    const app = makeServer()
    await app.request('/flags/k', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false }),
    })
    const first = (await (
      await app.request('/flags/k', { headers: adminHeaders })
    ).json()) as StoredFlag

    await app.request('/flags/k', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })
    const second = (await (
      await app.request('/flags/k', { headers: adminHeaders })
    ).json()) as StoredFlag

    expect(second.metadata.createdAt).toBe(first.metadata.createdAt)
    expect(second.metadata.createdBy).toBe(first.metadata.createdBy)
    expect(second.enabled).toBe(true)
  })

  it('rejects an unsafe flag key with 400', async () => {
    const app = makeServer()
    const res = await app.request('/flags/has%20space', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a flag with invalid targeting rules with 400', async () => {
    const app = makeServer()
    const res = await app.request('/flags/k', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        enabled: true,
        rules: [
          {
            conditions: [{ attribute: 'plan', operator: 'regex', value: '.*' }],
            result: { enabled: true },
          },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid JSON body with 400', async () => {
    const app = makeServer()
    const res = await app.request('/flags/k', {
      method: 'PUT',
      headers: adminHeaders,
      body: '{ not json',
    })
    expect(res.status).toBe(400)
  })
})

describe('read/write consistency', () => {
  it('reflects an admin write on the read path immediately (cache invalidation)', async () => {
    const app = makeServer()

    let res = await app.request('/ofrep/v1/evaluate/flags/live', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: {} }),
    })
    expect(res.status).toBe(404)

    await app.request('/flags/live', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, rollout: { percentage: 100 } }),
    })

    res = await app.request('/ofrep/v1/evaluate/flags/live', {
      method: 'POST',
      headers: readHeaders,
      body: JSON.stringify({ context: {} }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { value: boolean }).value).toBe(true)
  })
})
