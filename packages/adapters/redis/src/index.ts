import { parseFlag, type FeatureFlag, type StorageAdapter } from '@flaghoist/core'

/**
 * The minimal structural subset of a Redis client this adapter uses (hash commands). Both
 * `ioredis` (Node) and `@upstash/redis` (edge, HTTP) satisfy it — their `hget`/`hset`/`hdel`/
 * `hgetall` are lowercase and command-compatible. Pass your client directly; no dependency on a
 * specific Redis library. (node-redis v4 uses camelCase — wrap it in a tiny shim if you use it.)
 */
export interface RedisClientLike {
  hget(key: string, field: string): Promise<unknown>
  hset(key: string, field: string, value: string): Promise<unknown>
  hdel(key: string, field: string): Promise<unknown>
  hgetall(key: string): Promise<Record<string, unknown> | null | undefined>
}

export interface RedisAdapterOptions {
  /** Redis hash key under which all flags are stored. Default: `"flaghoist:flags"`. */
  hashKey?: string
}

/**
 * Coerce a stored value into a flag. Handles both string-returning clients (ioredis) and clients
 * that auto-deserialize JSON (Upstash), and re-validates through `parseFlag` so tampered or
 * corrupted data degrades to "flag ignored".
 */
function toFlag(raw: unknown): FeatureFlag | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return parseFlag(JSON.parse(raw))
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return parseFlag(raw)
  return null
}

/**
 * A StorageAdapter backed by Redis. All flags live in a single hash, so reads and writes are
 * simple hash commands and `list()` is one `hgetall` — no key scanning. Works from Node
 * (ioredis) and from edge runtimes (Upstash's HTTP client).
 */
export function redisAdapter(
  client: RedisClientLike,
  options: RedisAdapterOptions = {},
): StorageAdapter {
  const hashKey = options.hashKey ?? 'flaghoist:flags'

  return {
    async get(key) {
      return toFlag(await client.hget(hashKey, key))
    },
    async put(key, flag) {
      await client.hset(hashKey, key, JSON.stringify(flag))
    },
    async delete(key) {
      await client.hdel(hashKey, key)
    },
    async list() {
      const all = await client.hgetall(hashKey)
      if (!all) return []
      const flags: FeatureFlag[] = []
      for (const raw of Object.values(all)) {
        const flag = toFlag(raw)
        if (flag) flags.push(flag)
      }
      return flags
    },
  }
}
