import { testStorageAdapter } from '@flaghoist/adapter-conformance'
import { createFlag } from '@flaghoist/core'
import { describe, expect, it } from 'vitest'
import { memoryAdapter } from './index'

testStorageAdapter('memory', () => memoryAdapter())

describe('memoryAdapter — specifics', () => {
  it('accepts seed flags', async () => {
    const adapter = memoryAdapter([
      createFlag({ key: 'seeded', enabled: true, rollout: { percentage: 100 } }),
    ])
    expect((await adapter.get('seeded'))?.enabled).toBe(true)
    expect(await adapter.list()).toHaveLength(1)
  })

  it('isolates the store from later mutation of the input flag', async () => {
    const flag = createFlag({ key: 'k', enabled: true, rollout: { percentage: 100 } })
    const adapter = memoryAdapter()
    await adapter.put('k', flag)
    flag.enabled = false // mutate the original after the put
    expect((await adapter.get('k'))?.enabled).toBe(true)
  })
})
