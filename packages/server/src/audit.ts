export interface AuditEntry {
  timestamp: string
  action: 'create' | 'update' | 'delete'
  flagKey: string
  actor: string
}

export interface AuditLog {
  record(entry: Omit<AuditEntry, 'timestamp'>): void
  entries(): AuditEntry[]
}

export function createAuditLog(capacity = 100): AuditLog {
  const buf: AuditEntry[] = []

  return {
    record(entry) {
      buf.push({ ...entry, timestamp: new Date().toISOString() })
      if (buf.length > capacity) buf.splice(0, buf.length - capacity)
    },
    entries() {
      return buf.slice().reverse()
    },
  }
}
