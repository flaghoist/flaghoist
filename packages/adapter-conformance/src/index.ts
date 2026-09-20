import { createFlag, type StorageAdapter, type WebhookEndpoint } from '@flaghoist/core'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * The shared conformance suite every Flaghoist StorageAdapter must pass. Call it from an
 * adapter's test file with a factory that produces a fresh, empty adapter. This is the
 * executable contract behind "bring your own DB": a new adapter proves itself by passing it.
 *
 * @example
 *   testStorageAdapter('my-db', () => myDbAdapter(freshConnection()))
 */
export function testStorageAdapter(
  name: string,
  factory: () => StorageAdapter | Promise<StorageAdapter>,
): void {
  describe(`StorageAdapter conformance: ${name}`, () => {
    let adapter: StorageAdapter

    beforeEach(async () => {
      adapter = await factory()
    })

    it('returns null for a missing key', async () => {
      expect(await adapter.get('missing')).toBeNull()
    })

    it('stores and retrieves a flag', async () => {
      const flag = createFlag({ key: 'checkout', enabled: true, rollout: { percentage: 100 } })
      await adapter.put('checkout', flag)
      const got = await adapter.get('checkout')
      expect(got?.key).toBe('checkout')
      expect(got?.enabled).toBe(true)
      expect(got?.rollout.percentage).toBe(100)
    })

    it('overwrites an existing key', async () => {
      await adapter.put('k', createFlag({ key: 'k', enabled: false }))
      await adapter.put('k', createFlag({ key: 'k', enabled: true, rollout: { percentage: 50 } }))
      const got = await adapter.get('k')
      expect(got?.enabled).toBe(true)
      expect(got?.rollout.percentage).toBe(50)
    })

    it('deletes a flag', async () => {
      await adapter.put('k', createFlag({ key: 'k' }))
      await adapter.delete('k')
      expect(await adapter.get('k')).toBeNull()
    })

    it('treats deleting a missing key as a no-op', async () => {
      await expect(adapter.delete('nope')).resolves.toBeUndefined()
    })

    it('lists all stored flags', async () => {
      await adapter.put('a', createFlag({ key: 'a' }))
      await adapter.put('b', createFlag({ key: 'b' }))
      await adapter.put('c', createFlag({ key: 'c' }))
      const keys = (await adapter.list()).map((f) => f.key).sort()
      expect(keys).toEqual(['a', 'b', 'c'])
    })

    it('returns an empty list when nothing is stored', async () => {
      expect(await adapter.list()).toEqual([])
    })

    it('reflects deletions in list', async () => {
      await adapter.put('a', createFlag({ key: 'a' }))
      await adapter.put('b', createFlag({ key: 'b' }))
      await adapter.delete('a')
      const keys = (await adapter.list()).map((f) => f.key)
      expect(keys).toEqual(['b'])
    })

    it('returns independent copies — mutating a result does not affect the store', async () => {
      await adapter.put('k', createFlag({ key: 'k', enabled: true, rollout: { percentage: 100 } }))
      const first = await adapter.get('k')
      if (first) first.enabled = false
      const second = await adapter.get('k')
      expect(second?.enabled).toBe(true)
    })

    it('preserves the full flag shape through a round trip, including rules', async () => {
      const flag = createFlag({
        key: 'checkout',
        enabled: true,
        rollout: { percentage: 40 },
        description: 'Redesigned checkout',
        rules: [
          {
            description: 'beta cohort',
            conditions: [
              { attribute: 'plan', operator: 'eq', value: 'beta' },
              { attribute: 'country', operator: 'in', value: ['NG', 'GH'] },
            ],
            result: { enabled: true, rollout: { percentage: 25 } },
          },
        ],
      })
      await adapter.put('checkout', flag)
      expect(await adapter.get('checkout')).toEqual(flag)
      const listed = (await adapter.list()).find((f) => f.key === 'checkout')
      expect(listed).toEqual(flag)
    })

    describe('webhooks', () => {
      const hook: WebhookEndpoint = {
        id: 'wh1',
        url: 'https://example.com/hook',
        secret: 'abc123',
        events: ['flag.created', 'flag.updated'],
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      it('returns null for a missing webhook', async () => {
        expect(await adapter.getWebhook!('missing')).toBeNull()
      })

      it('stores and retrieves a webhook', async () => {
        await adapter.putWebhook!(hook.id, hook)
        const got = await adapter.getWebhook!(hook.id)
        expect(got).toEqual(hook)
      })

      it('overwrites an existing webhook', async () => {
        await adapter.putWebhook!(hook.id, hook)
        const updated = { ...hook, url: 'https://new.example.com', enabled: false }
        await adapter.putWebhook!(hook.id, updated)
        const got = await adapter.getWebhook!(hook.id)
        expect(got?.url).toBe('https://new.example.com')
        expect(got?.enabled).toBe(false)
      })

      it('deletes a webhook', async () => {
        await adapter.putWebhook!(hook.id, hook)
        await adapter.deleteWebhook!(hook.id)
        expect(await adapter.getWebhook!(hook.id)).toBeNull()
      })

      it('lists all webhooks', async () => {
        const hook2: WebhookEndpoint = { ...hook, id: 'wh2', url: 'https://b.example.com' }
        await adapter.putWebhook!(hook.id, hook)
        await adapter.putWebhook!(hook2.id, hook2)
        const ids = (await adapter.listWebhooks!()).map((w) => w.id).sort()
        expect(ids).toEqual(['wh1', 'wh2'])
      })

      it('returns an empty list when no webhooks exist', async () => {
        expect(await adapter.listWebhooks!()).toEqual([])
      })

      it('reflects deletions in the list', async () => {
        await adapter.putWebhook!(hook.id, hook)
        await adapter.deleteWebhook!(hook.id)
        expect(await adapter.listWebhooks!()).toEqual([])
      })
    })
  })
}
