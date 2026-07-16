import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

const handlers: Record<string, Array<() => void>> = {}
let flagValue = true

vi.mock('@openfeature/web-sdk', () => ({
  ProviderEvents: { Ready: 'Ready', ConfigurationChanged: 'ConfigurationChanged' },
  OpenFeature: {
    getClient: () => ({
      getBooleanValue: (_key: string, _def: boolean) => flagValue,
      addHandler: (event: string, handler: () => void) => {
        ;(handlers[event] ??= []).push(handler)
      },
      removeHandler: (event: string, handler: () => void) => {
        handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler)
      },
    }),
  },
}))

const { useFeatureFlag } = await import('../src/composable')

describe('useFeatureFlag', () => {
  it('returns the current flag value', () => {
    flagValue = true
    const scope = effectScope()
    scope.run(() => {
      expect(useFeatureFlag('new-checkout').value).toBe(true)
    })
    scope.stop()
  })

  it('updates reactively when the provider configuration changes', () => {
    flagValue = true
    const scope = effectScope()
    scope.run(() => {
      const flag = useFeatureFlag('new-checkout')
      expect(flag.value).toBe(true)
      flagValue = false
      for (const handler of handlers['ConfigurationChanged'] ?? []) handler()
      expect(flag.value).toBe(false)
    })
    scope.stop()
  })

  it('unregisters handlers when the scope is disposed', () => {
    const before = (handlers['Ready'] ?? []).length
    const scope = effectScope()
    scope.run(() => useFeatureFlag('x'))
    expect((handlers['Ready'] ?? []).length).toBe(before + 1)
    scope.stop()
    expect((handlers['Ready'] ?? []).length).toBe(before)
  })
})
