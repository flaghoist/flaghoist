<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  serverUrl: string
  token: string
  environment?: string
  /** Show the Security tab: sign-ins and webhook changes. Admin and Owner only. */
  canSeeSecurity?: boolean
}>()
const emit = defineEmits<{ back: [] }>()

interface FlagSnapshot {
  enabled: boolean
  rollout: { percentage: number }
  description: string
}

type Action = 'create' | 'update' | 'delete' | 'archive' | 'restore'
type Category = 'flags' | 'security'

interface AuditEntry {
  id: string
  timestamp: string
  action: string
  flagKey?: string
  target?: { type: string; id: string }
  actor: string
  previous?: FlagSnapshot
  current?: FlagSnapshot
  changeDescription?: string
}

const PAGE_SIZE = 30
const entries = ref<AuditEntry[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const error = ref('')
const actionFilter = ref<Action | ''>('')
const category = ref<Category>('flags')

const actions: { value: Action | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Updated' },
  { value: 'delete', label: 'Deleted' },
  { value: 'archive', label: 'Archived' },
  { value: 'restore', label: 'Restored' },
]

const totalPages = () => Math.max(1, Math.ceil(total.value / PAGE_SIZE))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String((page.value - 1) * PAGE_SIZE))
    if (category.value === 'security') params.set('category', 'security')
    else if (actionFilter.value) params.set('action', actionFilter.value)
    const headers: Record<string, string> = { authorization: `Bearer ${props.token}` }
    if (props.environment) headers['x-flaghoist-environment'] = props.environment
    const res = await fetch(`${props.serverUrl}/api/v1/audit?${params}`, { headers })
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

// Classes reuse the flag action colours: green for additions, accent for changes, red for
// failures and removals, grey for things that simply ended.
const actionTone: Record<string, string> = {
  login: 'create',
  'login.failed': 'delete',
  logout: 'archive',
  'password.changed': 'update',
  'session.revoked': 'archive',
  'password.reset': 'update',
  'user.created': 'create',
  'user.updated': 'update',
  'user.removed': 'delete',
  'invite.created': 'create',
  'invite.accepted': 'create',
  'invite.revoked': 'delete',
  'token.created': 'create',
  'token.revoked': 'delete',
  'token.expired': 'archive',
  'two_factor.enabled': 'create',
  'two_factor.disabled': 'delete',
  'two_factor.reset': 'delete',
  'two_factor.recovery_used': 'update',
  'webhook.created': 'create',
  'webhook.updated': 'update',
  'webhook.deleted': 'delete',
}

const securityText: Record<string, string> = {
  login: 'Signed in',
  'login.failed': 'Sign-in failed',
  logout: 'Signed out',
  'password.changed': 'Changed password',
  'session.revoked': 'Signed out a session',
  'password.reset': 'Created a password reset link',
  'user.created': 'Created account',
  'user.updated': 'Changed a member',
  'user.removed': 'Removed a member',
  'invite.created': 'Invited',
  'invite.accepted': 'Accepted an invite',
  'invite.revoked': 'Cancelled an invite',
  'token.created': 'Created an access token',
  'token.revoked': 'Revoked an access token',
  'token.expired': 'Access token expired',
  'two_factor.enabled': 'Turned on two-factor',
  'two_factor.disabled': 'Turned off two-factor',
  'two_factor.reset': "Reset a member's two-factor",
  'two_factor.recovery_used': 'Used a recovery code',
  'webhook.created': 'Added webhook',
  'webhook.updated': 'Edited webhook',
  'webhook.deleted': 'Removed webhook',
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
  if (entry.action === 'archive') return 'Flag archived'
  if (entry.action === 'restore') return 'Flag restored'
  return securityText[entry.action] ?? entry.action
}

function subject(entry: AuditEntry): string {
  return entry.flagKey ?? entry.target?.id ?? entry.target?.type ?? ''
}

// The verb that reads before the target, e.g. "admin  updated  dark-mode".
const flagVerb: Record<string, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  archive: 'archived',
  restore: 'restored',
}
function verb(entry: AuditEntry): string {
  return category.value === 'security'
    ? (securityText[entry.action] ?? entry.action)
    : (flagVerb[entry.action] ?? entry.action)
}

// The one-line diff shown as a chip. Security rows carry their story in the verb, so no chip.
function diff(entry: AuditEntry): string {
  if (category.value === 'security') return ''
  const text = describeChange(entry)
  return text === 'Flag archived' || text === 'Flag restored' ? '' : text
}

const DOT: Record<string, string> = {
  create: 'var(--green)',
  update: 'var(--signal)',
  delete: 'var(--red)',
  archive: 'var(--text-mute)',
  restore: 'var(--text-2)',
  security: 'var(--text-2)',
}
function dotColor(entry: AuditEntry): string {
  return DOT[actionTone[entry.action] ?? entry.action] ?? 'var(--text-2)'
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Entries arrive newest-first; keep that order while gathering them under day headings.
const groups = computed(() => {
  const out: { day: string; entries: AuditEntry[] }[] = []
  for (const entry of entries.value) {
    const day = dayLabel(entry.timestamp)
    const last = out[out.length - 1]
    if (last && last.day === day) last.entries.push(entry)
    else out.push({ day, entries: [entry] })
  }
  return out
})

watch(category, () => {
  actionFilter.value = ''
  page.value = 1
  void load()
})

watch(actionFilter, () => {
  page.value = 1
  void load()
})

watch(page, () => void load())

watch(
  () => props.environment,
  () => {
    page.value = 1
    void load()
  },
)

onMounted(() => void load())
</script>

<template>
  <main class="audit-page">
    <div class="page-head">
      <div class="page-head-text">
        <h1 class="page-title">Audit log</h1>
        <p class="page-sub">Every change, who made it and why.</p>
      </div>
      <span v-if="!loading" class="entry-count mono">{{ total }} entries</span>
    </div>

    <div class="audit-controls">
      <div v-if="canSeeSecurity" class="ck-tabs ck-tabs--enclosed ck-tabs--sm seg" aria-label="Which log">
        <div class="ck-tabs__list" role="tablist">
          <button
            class="ck-tabs__trigger"
            role="tab"
            :aria-selected="category === 'flags'"
            @click="category = 'flags'"
          >
            Flag changes
          </button>
          <button
            class="ck-tabs__trigger"
            role="tab"
            :aria-selected="category === 'security'"
            @click="category = 'security'"
          >
            Security
          </button>
        </div>
      </div>

      <div
        v-if="category === 'flags'"
        class="audit-filters"
        role="group"
        aria-label="Filter audit entries"
      >
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
    </div>

    <p v-if="loading && entries.length === 0" class="status">Loading...</p>
    <p v-else-if="error" class="status err">{{ error }}</p>

    <section v-else class="log-card">
      <p v-if="entries.length === 0" class="status">No activity recorded yet.</p>
      <div v-for="group in groups" :key="group.day" class="day-group">
        <div class="day-head">{{ group.day }}</div>
        <div v-for="entry in group.entries" :key="entry.id" class="log-entry">
          <span class="entry-dot" :style="{ background: dotColor(entry) }"></span>
          <div class="entry-body">
            <div class="entry-line">
              <span class="entry-actor">{{ entry.actor }}</span> {{ verb(entry) }}
              <code v-if="subject(entry)" class="mono entry-target">{{ subject(entry) }}</code>
            </div>
            <span v-if="diff(entry)" class="entry-diff mono">{{ diff(entry) }}</span>
            <span v-if="entry.changeDescription" class="entry-reason"
              >“{{ entry.changeDescription }}”</span
            >
          </div>
          <span class="entry-time mono" :title="entry.timestamp">{{
            formatClock(entry.timestamp)
          }}</span>
        </div>
      </div>
    </section>

    <nav v-if="totalPages() > 1" class="pagination" aria-label="Audit log pages">
      <button
        class="ck-btn ck-btn--outline ck-btn--sm"
        :disabled="page <= 1"
        @click="page = Math.max(1, page - 1)"
      >
        Previous
      </button>
      <span class="page-info mono">{{ page }} / {{ totalPages() }}</span>
      <button
        class="ck-btn ck-btn--outline ck-btn--sm"
        :disabled="page >= totalPages()"
        @click="page = Math.min(totalPages(), page + 1)"
      >
        Next
      </button>
    </nav>
  </main>
</template>

<style scoped>
.audit-page {
  flex: 1;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 36px 32px 64px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.page-head {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.page-head-text {
  flex: 1;
  min-width: 200px;
}
.page-title {
  font-size: 1.625rem;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.page-sub {
  margin: 4px 0 0;
  color: var(--text-mute);
  font-size: 0.875rem;
}
.entry-count {
  font-size: 0.75rem;
  color: var(--text-mute);
}

.audit-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.audit-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-2);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  padding: 0.32rem 0.7rem;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.chip:hover {
  border-color: var(--text-mute);
  color: var(--text);
}
.chip.on {
  color: var(--accent-text);
  border-color: var(--signal);
  background: var(--accent-wash);
}

.status {
  font-size: 0.84rem;
  color: var(--text-mute);
  text-align: center;
  padding: 3rem 0;
}
.status.err {
  color: var(--red-text);
}

.log-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
}
.day-head {
  padding: 10px 22px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-mute);
  background: var(--surface-2);
  border-bottom: 1px solid var(--line-soft);
}
.log-entry {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  gap: 14px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--line-soft);
  align-items: start;
}
.log-entry:last-child {
  border-bottom: none;
}
.entry-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--r-pill);
  margin-top: 6px;
}
.entry-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.entry-line {
  font-size: 0.84rem;
  color: var(--text-2);
}
.entry-actor {
  color: var(--text);
  font-weight: 500;
}
.entry-target {
  font-size: 0.8rem;
  color: var(--text);
  font-weight: 500;
}
.entry-diff {
  align-self: flex-start;
  font-size: 0.72rem;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  padding: 1px 8px;
  border-radius: 5px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-reason {
  font-size: 0.78rem;
  color: var(--text-mute);
  font-style: italic;
}
.entry-time {
  font-size: 0.72rem;
  color: var(--text-mute);
  white-space: nowrap;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
}
.page-info {
  font-size: 0.78rem;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .audit-page {
    padding: 24px 16px 64px;
  }
}
</style>
