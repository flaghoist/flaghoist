import { testStorageAdapter } from '@flaghoist/adapter-conformance'
import { createFlag } from '@flaghoist/core'
import { describe, expect, it } from 'vitest'
import { cloudflareKV, type KVNamespaceLike } from './index'

/** An in-memory stand-in for a Cloudflare KV namespace, with helpers to inspect raw storage. */
class FakeKV implements KVNamespaceLike {
  private store = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
  async list(options?: { prefix?: string }) {
    const prefix = options?.prefix ?? ''
    const keys = [...this.store.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name }))
    return { keys, list_complete: true }
  }

  raw(key: string): string | undefined {
    return this.store.get(key)
  }
  seedRaw(key: string, value: string): void {
    this.store.set(key, value)
  }
}

testStorageAdapter('cloudflare-kv', () => cloudflareKV(new FakeKV()))

describe('cloudflareKV — specifics', () => {
  it('namespaces keys with the prefix', async () => {
    const kv = new FakeKV()
    const adapter = cloudflareKV(kv)
    await adapter.put('checkout', createFlag({ key: 'checkout', enabled: true }))
    expect(kv.raw('flag:checkout')).toBeDefined()
    expect(kv.raw('checkout')).toBeUndefined()
  })

  it('supports a custom prefix', async () => {
    const kv = new FakeKV()
    const adapter = cloudflareKV(kv, { prefix: 'ff/' })
    await adapter.put('k', createFlag({ key: 'k' }))
    expect(kv.raw('ff/k')).toBeDefined()
  })

  it('validates on read: malformed JSON or bad shape yields null and is skipped by list', async () => {
    const kv = new FakeKV()
    const adapter = cloudflareKV(kv)
    kv.seedRaw('flag:broken', '{ not valid json')
    kv.seedRaw('flag:bad-shape', JSON.stringify({ nonsense: true }))
    await adapter.put('good', createFlag({ key: 'good', enabled: true }))

    expect(await adapter.get('broken')).toBeNull()
    expect(await adapter.get('bad-shape')).toBeNull()
    const keys = (await adapter.list()).map((f) => f.key)
    expect(keys).toEqual(['good'])
  })

  it('ignores keys outside the prefix when listing', async () => {
    const kv = new FakeKV()
    const adapter = cloudflareKV(kv)
    kv.seedRaw('other:thing', JSON.stringify({ key: 'thing', enabled: true }))
    await adapter.put('mine', createFlag({ key: 'mine' }))
    const keys = (await adapter.list()).map((f) => f.key)
    expect(keys).toEqual(['mine'])
  })
})
