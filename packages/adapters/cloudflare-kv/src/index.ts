import {
  assertRecordAddress,
  parseFlag,
  type FeatureFlag,
  type RecordEntry,
  type StorageAdapter,
  type WebhookEndpoint,
} from '@flaghoist/core'

/**
 * The minimal structural subset of the Cloudflare Workers `KVNamespace` API this adapter uses.
 * The real binding (`env.FLAGS`) is assignable to this, so `cloudflareKV(env.FLAGS)` just works
 * without depending on `@cloudflare/workers-types`.
 */
export interface KVNamespaceLike {
  get(key: string, options?: { type?: 'text' }): Promise<string | null>
  put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: Array<{ name: string; metadata?: unknown }>
    list_complete: boolean
    cursor?: string
  }>
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

  /** Key prefix for webhook entries. Default: `"webhook:"`. */
  webhookPrefix?: string

  /** Key prefix for record-store entries, stored as `<prefix><collection>:<id>`. Default: `"record:"`. */
  recordPrefix?: string
}

/**
 * KV metadata stamped on every key Flaghoist writes that is not a flag. `list()` returns metadata
 * alongside key names at no extra cost, so an unprefixed flag listing can skip these keys without
 * paying a read for each one.
 */
type EntryKind = 'webhook' | 'record'
const markAs = (kind: EntryKind) => ({ metadata: { flaghoist: kind } })
const isMarkedNonFlag = (metadata: unknown): boolean =>
  typeof metadata === 'object' &&
  metadata !== null &&
  ((metadata as { flaghoist?: unknown }).flaghoist === 'webhook' ||
    (metadata as { flaghoist?: unknown }).flaghoist === 'record')

function safeParse(raw: string | null): FeatureFlag | null {
  if (raw == null) return null
  try {
    return parseFlag(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function safeParseWebhook(raw: string | null): WebhookEndpoint | null {
  if (raw == null) return null
  try {
    return JSON.parse(raw) as WebhookEndpoint
  } catch {
    return null
  }
}

// Records are wrapped in an envelope, so a record whose value happens to look like a flag can
// never be mistaken for one by an unprefixed `list()`, whatever the KV metadata says.
const wrapRecord = (value: unknown): string => JSON.stringify({ flaghoistRecord: 1, value })

function unwrapRecord(raw: string | null): unknown | null {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw) as { flaghoistRecord?: unknown; value?: unknown } | null
    if (parsed === null || typeof parsed !== 'object' || parsed.flaghoistRecord !== 1) return null
    return parsed.value ?? null
  } catch {
    return null
  }
}

/** Every key under `prefix`, following the cursor to the end. */
async function listAll(
  kv: KVNamespaceLike,
  prefix: string,
): Promise<Array<{ name: string; metadata?: unknown }>> {
  const keys: Array<{ name: string; metadata?: unknown }> = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix, cursor })
    keys.push(...page.keys)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return keys
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
  const whPrefix = options.webhookPrefix ?? 'webhook:'
  const recPrefix = options.recordPrefix ?? 'record:'
  const recordKey = (collection: string, id: string) => `${recPrefix}${collection}:${id}`

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
      const keys = (await listAll(kv, prefix)).filter((k) => !isMarkedNonFlag(k.metadata))
      const raws = await Promise.all(keys.map((k) => kv.get(k.name, { type: 'text' })))
      const flags: FeatureFlag[] = []
      for (const raw of raws) {
        const flag = safeParse(raw)
        if (flag) flags.push(flag)
      }
      return flags
    },

    async putWebhook(id, webhook) {
      await kv.put(whPrefix + id, JSON.stringify(webhook), markAs('webhook'))
    },
    async getWebhook(id) {
      return safeParseWebhook(await kv.get(whPrefix + id, { type: 'text' }))
    },
    async deleteWebhook(id) {
      await kv.delete(whPrefix + id)
    },
    async listWebhooks() {
      const keys = await listAll(kv, whPrefix)
      const raws = await Promise.all(keys.map((k) => kv.get(k.name, { type: 'text' })))
      const hooks: WebhookEndpoint[] = []
      for (const raw of raws) {
        const hook = safeParseWebhook(raw)
        if (hook) hooks.push(hook)
      }
      return hooks
    },

    async getRecord(collection, id) {
      assertRecordAddress(collection, id)
      return unwrapRecord(await kv.get(recordKey(collection, id), { type: 'text' }))
    },
    async putRecord(collection, id, value) {
      assertRecordAddress(collection, id)
      await kv.put(recordKey(collection, id), wrapRecord(value), markAs('record'))
    },
    async deleteRecord(collection, id) {
      assertRecordAddress(collection, id)
      await kv.delete(recordKey(collection, id))
    },
    async listRecords(collection) {
      assertRecordAddress(collection)
      const keyPrefix = `${recPrefix}${collection}:`
      const keys = await listAll(kv, keyPrefix)
      const raws = await Promise.all(keys.map((k) => kv.get(k.name, { type: 'text' })))
      const entries: RecordEntry[] = []
      keys.forEach((k, i) => {
        const value = unwrapRecord(raws[i] ?? null)
        if (value !== null) entries.push({ id: k.name.slice(keyPrefix.length), value })
      })
      return entries
    },
  }
}
