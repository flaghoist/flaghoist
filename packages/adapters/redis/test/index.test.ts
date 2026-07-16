import { testStorageAdapter } from '@flaghoist/adapter-conformance'
import { createFlag } from '@flaghoist/core'
import { describe, expect, it } from 'vitest'
import { redisAdapter, type RedisClientLike } from '../src/index'

/** An in-memory stand-in for a Redis hash client (ioredis-style lowercase commands). */
class FakeRedis implements RedisClientLike {
  private hashes = new Map<string, Map<string, string>>()

  private hash(key: string): Map<string, string> {
    let h = this.hashes.get(key)
    if (!h) {
      h = new Map()
      this.hashes.set(key, h)
    }
    return h
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.hash(key).get(field) ?? null
  }
  async hset(key: string, field: string, value: string): Promise<number> {
    this.hash(key).set(field, value)
    return 1
  }
  async hdel(key: string, field: string): Promise<number> {
    return this.hash(key).delete(field) ? 1 : 0
  }
  async hgetall(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.hash(key))
  }
}

testStorageAdapter('redis', () => redisAdapter(new FakeRedis()))

describe('redisAdapter — specifics', () => {
  it('stores all flags under a single configurable hash key', async () => {
    const client = new FakeRedis()
    const adapter = redisAdapter(client, { hashKey: 'ff:custom' })
    await adapter.put('a', createFlag({ key: 'a', enabled: true }))
    expect(await client.hget('ff:custom', 'a')).toBeTypeOf('string')
    expect(await client.hget('flaghoist:flags', 'a')).toBeNull()
  })

  it('tolerates a client that auto-deserializes JSON (Upstash-style)', async () => {
    // Upstash returns already-parsed objects rather than JSON strings.
    const store = new Map<string, string>()
    const upstashish: RedisClientLike = {
      hget: async (_key, field) => {
        const raw = store.get(field)
        return raw ? JSON.parse(raw) : null
      },
      hset: async (_key, field, value) => {
        store.set(field, value)
        return 1
      },
      hdel: async (_key, field) => (store.delete(field) ? 1 : 0),
      hgetall: async () => Object.fromEntries([...store].map(([k, v]) => [k, JSON.parse(v)])),
    }

    const adapter = redisAdapter(upstashish)
    await adapter.put(
      'checkout',
      createFlag({ key: 'checkout', enabled: true, rollout: { percentage: 100 } }),
    )
    expect((await adapter.get('checkout'))?.enabled).toBe(true)
    expect(await adapter.list()).toHaveLength(1)
  })

  it('validates on read: corrupt entries are skipped by list', async () => {
    const client = new FakeRedis()
    await client.hset('flaghoist:flags', 'broken', '{ not json')
    const adapter = redisAdapter(client)
    await adapter.put('good', createFlag({ key: 'good', enabled: true }))
    expect(await adapter.get('broken')).toBeNull()
    expect((await adapter.list()).map((f) => f.key)).toEqual(['good'])
  })
})
