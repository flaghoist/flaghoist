import { memoryAdapter } from '@flaghoist/adapter-memory'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { describe, expect, it } from 'vitest'
import { createAdminClient, createFlag, setRollout, setRules, toggleFlag } from '../src/admin'

function makeClient() {
  const app = createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken('admin-secret'), read: apiKey('read-key') },
  })
  return createAdminClient({
    url: 'http://flaghoist.local',
    token: 'admin-secret',
    fetch: async (input, init) => app.request(input, init),
  })
}

describe('admin client + flag operations', () => {
  it('creates, lists, gets, and deletes a flag', async () => {
    const client = makeClient()
    await createFlag(client, 'checkout', { enabled: true, percentage: 100, description: 'x' })

    expect((await client.list()).map((f) => f.key)).toEqual(['checkout'])
    expect((await client.get('checkout'))?.enabled).toBe(true)

    await client.delete('checkout')
    expect(await client.get('checkout')).toBeNull()
  })

  it('toggle, rollout, and rules each preserve the rest of the flag (read-modify-write)', async () => {
    const client = makeClient()
    await createFlag(client, 'k', { enabled: true, percentage: 100, description: 'keep me' })

    // toggle flips enabled but keeps the rollout
    const toggled = await toggleFlag(client, 'k', 'flip')
    expect(toggled.enabled).toBe(false)
    expect(toggled.rollout.percentage).toBe(100)

    // rollout changes the percentage but keeps enabled + description
    const rolled = await setRollout(client, 'k', 25)
    expect(rolled.rollout.percentage).toBe(25)
    expect(rolled.enabled).toBe(false)
    expect(rolled.description).toBe('keep me')

    // rules replace targeting but keep the rollout
    const withRules = await setRules(client, 'k', [
      {
        conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
        result: { enabled: true },
      },
    ])
    expect(withRules.rules).toHaveLength(1)
    expect(withRules.rollout.percentage).toBe(25)
  })

  it('throws a clear error when modifying a missing flag', async () => {
    await expect(toggleFlag(makeClient(), 'nope', 'flip')).rejects.toThrow(/not found/)
  })

  it('surfaces server validation errors on save', async () => {
    // A flag with an invalid rule should be rejected by the server with a 400.
    const client = makeClient()
    await createFlag(client, 'k', { enabled: true, percentage: 0 })
    await expect(
      setRules(client, 'k', [
        {
          conditions: [{ attribute: 'plan', operator: 'regex', value: '.*' }],
          result: { enabled: true },
        },
      ]),
    ).rejects.toThrow(/Failed to save/)
  })
})
