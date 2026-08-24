import { parseFlag, type FeatureFlag, type StorageAdapter } from '@flaghoist/core'

/**
 * The minimal structural subset of the Cloudflare Workers `KVNamespace` API this adapter uses.
 * The real binding (`env.FLAGS`) is assignable to this, so `cloudflareKV(env.FLAGS)` just works
 * without depending on `@cloudflare/workers-types`.
 */
export interface KVNamespaceLike {
  get(key: string, options?: { type?: 'text' }): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(options?: {
    prefix?: string
    cursor?: string
    limit?: number
  }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }>
}

export interface CloudflareKVOptions {
  /**
   * Namespace every key Flaghoist writes, and ignore anything without it when listing.
   *
   * Empty by default, so a flag called `checkout` is stored under `checkout` and the namespace
   * reads the way you expect when browsing it in the Cloudflare dashboard. Set this when the
   * namespace holds anything besides Flaghoist's flags: without it `list()` reads every key in the
   * namespace. Values that are not flags are skipped rather than surfacing as broken rows, but you
   * still pay a read for each one.
   *
   * @example cloudflareKV(env.FLAGS, { prefix: 'flag:' })
   */
  prefix?: string
}

function safeParse(raw: string | null): FeatureFlag | null {
  if (raw == null) return null
  try {
    return parseFlag(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

/**
 * A StorageAdapter backed by Cloudflare Workers KV, the default Flaghoist storage backend.
 * Flags are stored as JSON under a configurable key prefix, and every read is re-validated
 * through `parseFlag`, so tampered or corrupted data degrades to "flag ignored" rather than a
 * crash or a malformed evaluation.
 */
export function cloudflareKV(
  kv: KVNamespaceLike,
  options: CloudflareKVOptions = {},
): StorageAdapter {
  const prefix = options.prefix ?? ''

  return {
    async get(key) {
      return safeParse(await kv.get(prefix + key, { type: 'text' }))
    },
    async put(key, flag) {
      await kv.put(prefix + key, JSON.stringify(flag))
    },
    async delete(key) {
      await kv.delete(prefix + key)
    },
    async list() {
      const flags: FeatureFlag[] = []
      let cursor: string | undefined
      do {
        const page = await kv.list({ prefix, cursor })
        const raws = await Promise.all(
          page.keys.map((entry) => kv.get(entry.name, { type: 'text' })),
        )
        for (const raw of raws) {
          const flag = safeParse(raw)
          if (flag) flags.push(flag)
        }
        cursor = page.list_complete ? undefined : page.cursor
      } while (cursor)
      return flags
    },
  }
}
