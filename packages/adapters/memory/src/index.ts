import type { FeatureFlag, StorageAdapter } from '@flaghoist/core'

/**
 * An in-memory StorageAdapter backed by a Map — for local development, tests, and as a
 * fallback backend. Flags are deep-cloned on write and read, so the store behaves like a
 * serialized backend would: callers cannot mutate stored state by holding a reference.
 */
export function memoryAdapter(seed: FeatureFlag[] = []): StorageAdapter {
  const store = new Map<string, FeatureFlag>()
  for (const flag of seed) store.set(flag.key, structuredClone(flag))

  return {
    async get(key) {
      const flag = store.get(key)
      return flag ? structuredClone(flag) : null
    },
    async put(key, flag) {
      store.set(key, structuredClone(flag))
    },
    async delete(key) {
      store.delete(key)
    },
    async list() {
      return [...store.values()].map((flag) => structuredClone(flag))
    },
  }
}
