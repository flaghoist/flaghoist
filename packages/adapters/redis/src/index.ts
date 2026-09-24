import {
  assertRecordAddress,
  parseFlag,
  type FeatureFlag,
  type RecordEntry,
  type StorageAdapter,
  type WebhookEndpoint,
} from '@flaghoist/core'

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

  /** Redis hash key for webhook endpoints. Default: `"flaghoist:webhooks"`. */
  webhookHashKey?: string

  /**
   * Prefix for record-store hashes. Each collection gets its own hash, `<prefix><collection>`.
   * Default: `"flaghoist:records:"`.
   */
  recordHashPrefix?: string
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

function toWebhook(raw: unknown): WebhookEndpoint | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as WebhookEndpoint
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw as WebhookEndpoint
  return null
}

// Records are wrapped in an envelope so the read path is the same whether the client hands back
// the raw JSON string (ioredis) or an already-parsed object (Upstash), whatever the value's type.
const wrapRecord = (value: unknown): string => JSON.stringify({ flaghoistRecord: 1, value })

function unwrapRecord(raw: unknown): unknown | null {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const envelope = parsed as { flaghoistRecord?: unknown; value?: unknown }
  if (envelope.flaghoistRecord !== 1) return null
  return envelope.value ?? null
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
  const whKey = options.webhookHashKey ?? 'flaghoist:webhooks'
  const recPrefix = options.recordHashPrefix ?? 'flaghoist:records:'

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

    async putWebhook(id, webhook) {
      await client.hset(whKey, id, JSON.stringify(webhook))
    },
    async getWebhook(id) {
      return toWebhook(await client.hget(whKey, id))
    },
    async deleteWebhook(id) {
      await client.hdel(whKey, id)
    },
    async listWebhooks() {
      const all = await client.hgetall(whKey)
      if (!all) return []
      const hooks: WebhookEndpoint[] = []
      for (const raw of Object.values(all)) {
        const hook = toWebhook(raw)
        if (hook) hooks.push(hook)
      }
      return hooks
    },

    async getRecord(collection, id) {
      assertRecordAddress(collection, id)
      return unwrapRecord(await client.hget(recPrefix + collection, id))
    },
    async putRecord(collection, id, value) {
      assertRecordAddress(collection, id)
      await client.hset(recPrefix + collection, id, wrapRecord(value))
    },
    async deleteRecord(collection, id) {
      assertRecordAddress(collection, id)
      await client.hdel(recPrefix + collection, id)
    },
    async listRecords(collection) {
      assertRecordAddress(collection)
      const all = await client.hgetall(recPrefix + collection)
      if (!all) return []
      const entries: RecordEntry[] = []
      for (const [id, raw] of Object.entries(all)) {
        const value = unwrapRecord(raw)
        if (value !== null) entries.push({ id, value })
      }
      return entries
    },
  }
}
