<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{ serverUrl: string; token: string }>()
const emit = defineEmits<{ close: [] }>()

interface AuditEntry {
  timestamp: string
  action: 'create' | 'update' | 'delete'
  flagKey: string
  actor: string
}

const entries = ref<AuditEntry[]>([])
const loading = ref(true)
const error = ref('')

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const actionLabel: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
}

onMounted(async () => {
  try {
    const res = await fetch(`${props.serverUrl}/api/v1/audit`, {
      headers: { authorization: `Bearer ${props.token}` },
    })
    if (!res.ok) {
      error.value = res.status === 401 ? 'Unauthorized' : `Server error (${res.status})`
      return
    }
    const body = (await res.json()) as { entries: AuditEntry[] }
    entries.value = body.entries
  } catch {
    error.value = 'Failed to load audit log.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="panel card" role="dialog" aria-label="Audit log">
      <header class="panel-head">
        <h2>Audit log</h2>
        <button class="btn btn-ghost btn-sm" @click="emit('close')">Close</button>
      </header>

      <p v-if="loading" class="status">Loading...</p>
      <p v-else-if="error" class="status err">{{ error }}</p>
      <p v-else-if="entries.length === 0" class="status">No activity recorded yet.</p>

      <div v-else class="log-list">
        <div v-for="(entry, i) in entries" :key="i" class="log-entry">
          <span class="log-action" :class="entry.action">{{ actionLabel[entry.action] }}</span>
          <code class="mono log-key">{{ entry.flagKey }}</code>
          <span class="log-meta">
            by {{ entry.actor }} &middot; {{ formatTime(entry.timestamp) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 1rem;
}
.panel {
  width: 100%;
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 1.2rem;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.panel-head h2 {
  font-size: 1rem;
  font-weight: 600;
}
.status {
  font-size: 0.84rem;
  color: var(--text-2);
  text-align: center;
  padding: 2rem 0;
}
.status.err {
  color: var(--red-text);
}
.log-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.log-entry {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 0.82rem;
}
.log-entry:last-child {
  border-bottom: none;
}
.log-action {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  white-space: nowrap;
}
.log-action.create {
  color: var(--green-text);
  background: var(--green-wash);
}
.log-action.update {
  color: var(--accent-text);
  background: var(--accent-wash);
}
.log-action.delete {
  color: var(--red-text);
  background: var(--red-wash);
}
.log-key {
  font-size: 0.82rem;
  flex-shrink: 0;
}
.log-meta {
  color: var(--text-mute);
  font-size: 0.74rem;
  margin-left: auto;
  white-space: nowrap;
}
</style>
