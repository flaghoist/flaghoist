<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{ serverUrl: string; token: string }>()
const emit = defineEmits<{ back: [] }>()

interface FlagSnapshot {
  enabled: boolean
  rollout: { percentage: number }
  description: string
}

type Action = 'create' | 'update' | 'delete'

interface AuditEntry {
  id: string
  timestamp: string
  action: Action
  flagKey: string
  actor: string
  previous?: FlagSnapshot
  current?: FlagSnapshot
}

const PAGE_SIZE = 30
const entries = ref<AuditEntry[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const error = ref('')
const actionFilter = ref<Action | ''>('')

const actions: { value: Action | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Updated' },
  { value: 'delete', label: 'Deleted' },
]

const totalPages = () => Math.max(1, Math.ceil(total.value / PAGE_SIZE))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String((page.value - 1) * PAGE_SIZE))
    if (actionFilter.value) params.set('action', actionFilter.value)
    const res = await fetch(`${props.serverUrl}/api/v1/audit?${params}`, {
      headers: { authorization: `Bearer ${props.token}` },
    })
    if (!res.ok) {
      error.value = res.status === 401 ? 'Unauthorized' : `Server error (${res.status})`
      return
    }
    const body = (await res.json()) as { entries: AuditEntry[]; total: number }
    entries.value = body.entries
    total.value = body.total
  } catch {
    error.value = 'Failed to load audit log.'
  } finally {
    loading.value = false
  }
}

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

function describeChange(entry: AuditEntry): string {
  if (entry.action === 'create' && entry.current) {
    const parts: string[] = []
    parts.push(entry.current.enabled ? 'Enabled' : 'Disabled')
    if (entry.current.rollout.percentage > 0 && entry.current.rollout.percentage < 100) {
      parts.push(`${entry.current.rollout.percentage}% rollout`)
    }
    return parts.join(', ')
  }
  if (entry.action === 'delete' && entry.previous) {
    return `Was ${entry.previous.enabled ? 'enabled' : 'disabled'}, ${entry.previous.rollout.percentage}% rollout`
  }
  if (entry.action === 'update' && entry.previous && entry.current) {
    const changes: string[] = []
    if (entry.previous.enabled !== entry.current.enabled) {
      changes.push(entry.current.enabled ? 'Enabled' : 'Disabled')
    }
    if (entry.previous.rollout.percentage !== entry.current.rollout.percentage) {
      changes.push(
        `Rollout ${entry.previous.rollout.percentage}% → ${entry.current.rollout.percentage}%`,
      )
    }
    if (entry.previous.description !== entry.current.description) {
      changes.push('Description changed')
    }
    return changes.join(', ') || 'No visible change'
  }
  return ''
}

watch(actionFilter, () => {
  page.value = 1
  void load()
})

watch(page, () => void load())

onMounted(() => void load())
</script>

<template>
  <div class="audit-page">
    <header class="audit-head">
      <div class="audit-title-row">
        <button class="btn btn-ghost btn-sm" @click="emit('back')">
          <svg viewBox="0 0 24 24" aria-hidden="true" class="back-icon">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Flags
        </button>
        <h2>Audit log</h2>
        <span v-if="!loading" class="entry-count mono">{{ total }} entries</span>
      </div>

      <div class="audit-filters" role="group" aria-label="Filter audit entries">
        <button
          v-for="a in actions"
          :key="a.value"
          class="chip"
          :class="{ on: actionFilter === a.value }"
          :aria-pressed="actionFilter === a.value"
          @click="actionFilter = a.value"
        >
          {{ a.label }}
        </button>
      </div>
    </header>

    <p v-if="loading && entries.length === 0" class="status">Loading...</p>
    <p v-else-if="error" class="status err">{{ error }}</p>
    <p v-else-if="entries.length === 0" class="status">No activity recorded yet.</p>

    <div v-else class="log-list">
      <div v-for="entry in entries" :key="entry.id" class="log-entry">
        <span class="log-time" :title="entry.timestamp">{{ formatTime(entry.timestamp) }}</span>
        <span class="log-action" :class="entry.action">{{ actionLabel[entry.action] }}</span>
        <code class="mono log-key">{{ entry.flagKey }}</code>
        <span class="log-delta">{{ describeChange(entry) }}</span>
        <span class="log-actor">{{ entry.actor }}</span>
      </div>
    </div>

    <nav v-if="totalPages() > 1" class="pagination" aria-label="Audit log pages">
      <button
        class="btn btn-ghost btn-sm"
        :disabled="page <= 1"
        @click="page = Math.max(1, page - 1)"
      >
        Previous
      </button>
      <span class="page-info mono">{{ page }} / {{ totalPages() }}</span>
      <button
        class="btn btn-ghost btn-sm"
        :disabled="page >= totalPages()"
        @click="page = Math.min(totalPages(), page + 1)"
      >
        Next
      </button>
    </nav>
  </div>
</template>

<style scoped>
.audit-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.4rem 1.2rem 4rem;
}
.audit-head {
  margin-bottom: 1.2rem;
}
.audit-title-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.8rem;
}
.audit-title-row h2 {
  font-size: 1.05rem;
  font-weight: 600;
}
.back-icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.entry-count {
  margin-left: auto;
  font-size: 0.74rem;
  color: var(--text-mute);
}
.audit-filters {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-2);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  padding: 0.3rem 0.7rem;
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.chip:hover {
  border-color: var(--text-2);
}
.chip.on {
  color: var(--accent-text);
  border-color: var(--signal);
  background: var(--accent-wash);
}
.status {
  font-size: 0.84rem;
  color: var(--text-2);
  text-align: center;
  padding: 3rem 0;
}
.status.err {
  color: var(--red-text);
}
.log-list {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
}
.log-entry {
  display: grid;
  grid-template-columns: 7.5rem 5.2rem 1fr 1fr auto;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--line-soft);
  font-size: 0.82rem;
}
.log-entry:last-child {
  border-bottom: none;
}
.log-time {
  font-size: 0.74rem;
  color: var(--text-mute);
  white-space: nowrap;
}
.log-action {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  white-space: nowrap;
  text-align: center;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.log-delta {
  font-size: 0.78rem;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.log-actor {
  font-size: 0.74rem;
  color: var(--text-mute);
  text-align: right;
  white-space: nowrap;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  margin: 1rem 0 0;
}
.page-info {
  font-size: 0.78rem;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .log-entry {
    grid-template-columns: 1fr;
    gap: 0.2rem;
    padding: 0.7rem 0.8rem;
  }
  .log-time {
    order: 5;
  }
  .log-actor {
    text-align: left;
    order: 4;
  }
}
</style>
