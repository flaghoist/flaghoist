import {
  assertRecordAddress,
  auditCategory,
  type AuditEntry,
  type AuditListOptions,
  type AuditPage,
  type FeatureFlag,
  type StorageAdapter,
  type WebhookEndpoint,
} from '@flaghoist/core'

// Records go through a JSON round trip rather than structuredClone, so the memory adapter drops
// undefined fields and rejects non-JSON values exactly the way a serializing backend would.
const toJson = (value: unknown): string => JSON.stringify(value)
const fromJson = (raw: string): unknown => JSON.parse(raw) as unknown

/**
 * An in-memory StorageAdapter backed by a Map — for local development, tests, and as a
 * fallback backend. Flags are deep-cloned on write and read, so the store behaves like a
 * serialized backend would: callers cannot mutate stored state by holding a reference.
 */
export function memoryAdapter(seed: FeatureFlag[] = []): StorageAdapter {
  const store = new Map<string, FeatureFlag>()
  for (const flag of seed) store.set(flag.key, structuredClone(flag))

  const auditBuf: AuditEntry[] = []
  const webhooks = new Map<string, WebhookEndpoint>()
  const records = new Map<string, Map<string, string>>()
  const collection = (name: string): Map<string, string> => {
    let c = records.get(name)
    if (!c) {
      c = new Map()
      records.set(name, c)
    }
    return c
  }

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

    async appendAudit(entry: AuditEntry) {
      auditBuf.push(structuredClone(entry))
    },
    async listAudit(options?: AuditListOptions): Promise<AuditPage> {
      let entries = auditBuf.slice().reverse()
      if (options?.category) {
        entries = entries.filter((e) => auditCategory(e.action) === options.category)
      }
      if (options?.flagKey) entries = entries.filter((e) => e.flagKey === options.flagKey)
      if (options?.action) entries = entries.filter((e) => e.action === options.action)
      if (options?.environment !== undefined) {
        entries = entries.filter((e) => e.environment === options.environment)
      }
      const total = entries.length
      const offset = options?.offset ?? 0
      const limit = options?.limit ?? 50
      return { entries: entries.slice(offset, offset + limit), total }
    },

    async putWebhook(id: string, webhook: WebhookEndpoint) {
      webhooks.set(id, structuredClone(webhook))
    },
    async getWebhook(id: string) {
      const w = webhooks.get(id)
      return w ? structuredClone(w) : null
    },
    async deleteWebhook(id: string) {
      webhooks.delete(id)
    },
    async listWebhooks() {
      return [...webhooks.values()].map((w) => structuredClone(w))
    },

    async getRecord(name, id) {
      assertRecordAddress(name, id)
      const raw = records.get(name)?.get(id)
      return raw === undefined ? null : fromJson(raw)
    },
    async putRecord(name, id, value) {
      assertRecordAddress(name, id)
      collection(name).set(id, toJson(value))
    },
    async deleteRecord(name, id) {
      assertRecordAddress(name, id)
      records.get(name)?.delete(id)
    },
    async listRecords(name) {
      assertRecordAddress(name)
      return [...(records.get(name) ?? new Map<string, string>())].map(([id, raw]) => ({
        id,
        value: fromJson(raw),
      }))
    },
  }
}
