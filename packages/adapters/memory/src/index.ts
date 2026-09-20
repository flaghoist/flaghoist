import type {
  AuditEntry,
  AuditListOptions,
  AuditPage,
  FeatureFlag,
  StorageAdapter,
  WebhookEndpoint,
} from '@flaghoist/core'

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
      if (options?.flagKey) entries = entries.filter((e) => e.flagKey === options.flagKey)
      if (options?.action) entries = entries.filter((e) => e.action === options.action)
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
  }
}
