import type { FeatureFlag, StorageAdapter } from '@flaghoist/core'

/**
 * A tiny in-isolate cache of flag definitions for the read path. It holds the full flag set so
 * that a burst of evaluations does not hammer storage: at most one `list()` per TTL window per
 * isolate. Admin writes call `invalidate()` so changes appear immediately within the isolate;
 * across isolates, staleness is bounded by the TTL.
 */
export interface DefinitionCache {
  load(storage: StorageAdapter, ttlMs: number): Promise<FeatureFlag[]>
  invalidate(): void
}

export function createDefinitionCache(): DefinitionCache {
  let entry: { flags: FeatureFlag[]; expiresAt: number } | null = null

  return {
    async load(storage, ttlMs) {
      const now = Date.now()
      if (entry && entry.expiresAt > now) return entry.flags
      const flags = await storage.list()
      entry = { flags, expiresAt: now + ttlMs }
      return flags
    },
    invalidate() {
      entry = null
    },
  }
}
