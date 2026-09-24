import {
  auditCategory,
  type AuditCategory,
  type AuditEntry,
  type AuditListOptions,
  type AuditPage,
  type FlagSnapshot,
  type StorageAdapter,
} from '@flaghoist/core'

export type { AuditEntry, AuditPage, FlagSnapshot }

export interface AuditLog {
  record(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void>
  list(options?: AuditListOptions): Promise<AuditPage>
}

function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${ts}-${rand}`
}

/**
 * Build an audit log backed by the storage adapter's audit methods when available,
 * falling back to an in-memory ring buffer otherwise.
 */
export function createAuditLog(storage?: StorageAdapter | null): AuditLog {
  if (storage?.appendAudit && storage?.listAudit) {
    return {
      async record(entry) {
        await storage.appendAudit!({
          ...entry,
          id: generateId(),
          timestamp: new Date().toISOString(),
        })
      },
      async list(options) {
        return storage.listAudit!(options)
      },
    }
  }

  // One buffer per category, so a burst of failed sign-ins cannot push flag history out.
  const buffers: Record<AuditCategory, AuditEntry[]> = { flags: [], security: [] }
  const CAPACITY = 500

  return {
    async record(entry) {
      const buf = buffers[auditCategory(entry.action)]
      buf.push({ ...entry, id: generateId(), timestamp: new Date().toISOString() })
      if (buf.length > CAPACITY) buf.splice(0, buf.length - CAPACITY)
    },
    async list(options) {
      const source = options?.category
        ? buffers[options.category]
        : [...buffers.flags, ...buffers.security].sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp),
          )
      let entries = source.slice().reverse()
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
  }
}
