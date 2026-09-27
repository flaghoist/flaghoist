<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AdminClient, WebhookEndpoint, WebhookEvent, WebhookInput } from '../api'

const ALL_EVENTS: WebhookEvent[] = [
  'flag.created',
  'flag.updated',
  'flag.deleted',
  'flag.archived',
  'flag.restored',
]

// Opt-in: never part of "All flag events", so a receiver built for flags gets only flags.
const MEMBER_EVENTS: WebhookEvent[] = [
  'member.invited',
  'member.joined',
  'member.role_changed',
  'member.disabled',
  'member.enabled',
  'member.removed',
]

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'flag.created': 'Created',
  'flag.updated': 'Updated',
  'flag.deleted': 'Deleted',
  'flag.archived': 'Archived',
  'flag.restored': 'Restored',
  'member.invited': 'Member invited',
  'member.joined': 'Member joined',
  'member.role_changed': 'Role changed',
  'member.disabled': 'Member disabled',
  'member.enabled': 'Member enabled',
  'member.removed': 'Member removed',
}

const props = defineProps<{ api: AdminClient }>()
const emit = defineEmits<{ toast: [text: string, tone: 'ok' | 'error'] }>()

const webhooks = ref<WebhookEndpoint[]>([])
const loading = ref(true)

const showForm = ref(false)
const editingId = ref<string | null>(null)
const formUrl = ref('')
const formEvents = ref<Set<WebhookEvent>>(new Set(ALL_EVENTS))
const formEnabled = ref(true)
const formBusy = ref(false)

const revealedSecrets = ref<Set<string>>(new Set())
const testingId = ref<string | null>(null)

async function load() {
  try {
    webhooks.value = await props.api.listWebhooks()
  } catch (err) {
    emit('toast', err instanceof Error ? err.message : 'Failed to load webhooks', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  editingId.value = null
  formUrl.value = ''
  formEvents.value = new Set(ALL_EVENTS)
  formEnabled.value = true
  showForm.value = true
}

function openEdit(hook: WebhookEndpoint) {
  editingId.value = hook.id
  formUrl.value = hook.url
  formEvents.value = new Set(hook.events)
  formEnabled.value = hook.enabled
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingId.value = null
}

function toggleEvent(event: WebhookEvent) {
  if (formEvents.value.has(event)) {
    formEvents.value.delete(event)
  } else {
    formEvents.value.add(event)
  }
  formEvents.value = new Set(formEvents.value)
}

const allEventsSelected = computed(() => ALL_EVENTS.every((e) => formEvents.value.has(e)))

function toggleAllEvents() {
  const next = new Set(formEvents.value)
  for (const e of ALL_EVENTS) {
    if (allEventsSelected.value) next.delete(e)
    else next.add(e)
  }
  formEvents.value = next
}

async function save() {
  if (!formUrl.value.trim()) return
  if (formEvents.value.size === 0) {
    emit('toast', 'Select at least one event', 'error')
    return
  }
  formBusy.value = true
  try {
    const input: WebhookInput = {
      url: formUrl.value.trim(),
      events: [...formEvents.value],
      enabled: formEnabled.value,
    }
    if (editingId.value) {
      await props.api.updateWebhook(editingId.value, input)
      emit('toast', 'Webhook updated', 'ok')
    } else {
      const created = await props.api.createWebhook(input)
      revealedSecrets.value.add(created.id)
      emit('toast', 'Webhook created', 'ok')
    }
    closeForm()
    await load()
  } catch (err) {
    emit('toast', err instanceof Error ? err.message : 'Failed to save webhook', 'error')
  } finally {
    formBusy.value = false
  }
}

async function toggleEnabled(hook: WebhookEndpoint) {
  try {
    await props.api.updateWebhook(hook.id, { enabled: !hook.enabled })
    await load()
  } catch (err) {
    emit('toast', err instanceof Error ? err.message : 'Failed to update webhook', 'error')
  }
}

async function remove(hook: WebhookEndpoint) {
  try {
    await props.api.deleteWebhook(hook.id)
    emit('toast', 'Webhook deleted', 'ok')
    await load()
  } catch (err) {
    emit('toast', err instanceof Error ? err.message : 'Failed to delete webhook', 'error')
  }
}

async function test(hook: WebhookEndpoint) {
  testingId.value = hook.id
  try {
    const result = await props.api.testWebhook(hook.id)
    if (result.ok) {
      emit('toast', `Test delivered (HTTP ${result.status})`, 'ok')
    } else {
      emit('toast', result.error ?? `Test failed (HTTP ${result.status})`, 'error')
    }
  } catch (err) {
    emit('toast', err instanceof Error ? err.message : 'Test failed', 'error')
  } finally {
    testingId.value = null
  }
}

function toggleSecret(id: string) {
  if (revealedSecrets.value.has(id)) {
    revealedSecrets.value.delete(id)
  } else {
    revealedSecrets.value.add(id)
  }
  revealedSecrets.value = new Set(revealedSecrets.value)
}

function maskSecret(secret: string): string {
  return secret.slice(0, 8) + '•'.repeat(24)
}
</script>

<template>
  <main class="webhooks">
    <div class="page-head">
      <div class="page-head-text">
        <h1 class="page-title">Webhooks</h1>
        <p class="page-sub">
          Webhooks send a POST request to your URL when flag events occur. Each delivery includes an
          HMAC-SHA256 signature in the <code class="inline-code mono">X-Flaghoist-Signature</code>
          header.
        </p>
      </div>
      <button class="ck-btn ck-btn--solid ck-btn--sm" @click="openCreate">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="btn-icon">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add webhook
      </button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <section v-else-if="webhooks.length === 0" class="empty-state">
      <div class="empty-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2a4 4 0 0 0-3.46 6L3 18h6l3-5.2L15 18h6l-5.54-10A4 4 0 0 0 12 2z" />
        </svg>
      </div>
      <span class="empty-title">No webhooks configured</span>
      <span class="empty-sub">Add a webhook to get notified when flags change.</span>
    </section>

    <div v-else class="webhook-list">
      <section v-for="hook in webhooks" :key="hook.id" class="ck-card ck-card--outline webhook-card">
        <div class="webhook-top">
          <div class="webhook-info">
            <div class="webhook-url-row">
              <span
                class="webhook-status-dot"
                :class="hook.enabled ? 'active' : 'inactive'"
                :title="hook.enabled ? 'Enabled' : 'Disabled'"
              ></span>
              <code class="mono webhook-url">{{ hook.url }}</code>
            </div>
            <div class="webhook-events">
              <span v-for="ev in hook.events" :key="ev" class="event-badge">{{
                EVENT_LABELS[ev]
              }}</span>
            </div>
          </div>
          <button
            class="toggle"
            :data-on="hook.enabled"
            :aria-label="hook.enabled ? 'Disable webhook' : 'Enable webhook'"
            @click="toggleEnabled(hook)"
          ></button>
          <div class="webhook-actions">
            <button
              class="ck-btn ck-btn--ghost ck-btn--sm"
              :disabled="testingId === hook.id"
              @click="test(hook)"
            >
              {{ testingId === hook.id ? 'Sending...' : 'Test' }}
            </button>
            <button class="ck-btn ck-btn--ghost ck-btn--sm" @click="openEdit(hook)">Edit</button>
            <button class="ck-btn ck-btn--ghost ck-btn--sm danger-hover" @click="remove(hook)">Delete</button>
          </div>
        </div>

        <div class="webhook-secret-row">
          <span class="secret-label">Signing secret</span>
          <code class="mono secret-value">{{
            revealedSecrets.has(hook.id) ? hook.secret : maskSecret(hook.secret)
          }}</code>
          <button class="ck-btn ck-btn--ghost ck-btn--sm" @click="toggleSecret(hook.id)">
            {{ revealedSecrets.has(hook.id) ? 'Hide' : 'Reveal' }}
          </button>
        </div>
      </section>
    </div>

    <!-- Create / Edit dialog -->
    <div v-if="showForm" class="modal-overlay" @click.self="closeForm">
      <div class="modal" role="dialog" aria-labelledby="webhook-form-title">
        <div class="modal-head">
          <h2 id="webhook-form-title">{{ editingId ? 'Edit webhook' : 'Add webhook' }}</h2>
          <button class="esc-btn mono" aria-label="Close" @click="closeForm">esc</button>
        </div>

        <div class="modal-body">
          <label class="field">
            <span class="field-label">URL</span>
            <input
              v-model="formUrl"
              type="url"
              class="mono"
              placeholder="https://example.com/webhooks/flaghoist"
              required
            />
          </label>

          <div class="field">
            <div class="field-head">
              <span class="field-label">Flag events</span>
              <label class="all-check">
                <input type="checkbox" :checked="allEventsSelected" @change="toggleAllEvents" />
                All flag events
              </label>
            </div>
            <div class="chip-row">
              <button
                v-for="ev in ALL_EVENTS"
                :key="ev"
                type="button"
                class="event-chip"
                :class="{ on: formEvents.has(ev) }"
                :aria-pressed="formEvents.has(ev)"
                @click="toggleEvent(ev)"
              >
                {{ EVENT_LABELS[ev] }}
              </button>
            </div>
          </div>

          <div class="field">
            <span class="field-label">Member events</span>
            <p class="member-note">
              Invites, joins, role changes, disables and removals, for servers with user accounts.
              The payload has a <code class="mono">member</code> object instead of a
              <code class="mono">flag</code>.
            </p>
            <div class="chip-row">
              <button
                v-for="ev in MEMBER_EVENTS"
                :key="ev"
                type="button"
                class="event-chip"
                :class="{ on: formEvents.has(ev) }"
                :aria-pressed="formEvents.has(ev)"
                @click="toggleEvent(ev)"
              >
                {{ EVENT_LABELS[ev] }}
              </button>
            </div>
          </div>
        </div>

        <div class="modal-foot">
          <label class="enabled-row">
            <button
              type="button"
              class="toggle"
              :data-on="formEnabled"
              aria-label="Enabled"
              @click="formEnabled = !formEnabled"
            ></button>
            <span>Enabled</span>
          </label>
          <div class="foot-spacer"></div>
          <button class="ck-btn ck-btn--outline ck-btn--sm" @click="closeForm" :disabled="formBusy">
            Cancel
          </button>
          <button
            class="ck-btn ck-btn--solid ck-btn--sm"
            @click="save"
            :disabled="formBusy || !formUrl.trim()"
          >
            {{ formBusy ? 'Saving...' : editingId ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.webhooks {
  flex: 1;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 36px 32px 64px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.page-head {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.page-head-text {
  flex: 1;
  min-width: 240px;
}
.page-title {
  font-size: 1.625rem;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.page-sub {
  margin: 6px 0 0;
  color: var(--text-mute);
  font-size: 0.875rem;
  max-width: 620px;
  line-height: 1.55;
  text-wrap: pretty;
}

.loading {
  text-align: center;
  color: var(--text-mute);
  padding: 2rem;
}

.empty-state {
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
  padding: 64px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}
.empty-mark {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--accent-wash);
  color: var(--signal);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}
.empty-mark svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.empty-title {
  font-size: 0.95rem;
  font-weight: 600;
}
.empty-sub {
  font-size: 0.85rem;
  color: var(--text-mute);
}

.webhook-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.webhook-card {
  padding: 16px 22px;
}
.webhook-top {
  display: flex;
  align-items: center;
  gap: 16px;
}
.webhook-info {
  min-width: 0;
  flex: 1;
}
.webhook-url-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.webhook-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.webhook-status-dot.active {
  background: var(--green);
}
.webhook-status-dot.inactive {
  background: var(--text-mute);
}
.webhook-url {
  font-size: 0.82rem;
  word-break: break-all;
}
.webhook-events {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.event-badge {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-mute);
  background: var(--surface-2);
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
}
.webhook-actions {
  display: flex;
  gap: 0.15rem;
  flex-shrink: 0;
}

.webhook-secret-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line-soft);
}
.secret-label {
  font-size: 0.72rem;
  color: var(--text-mute);
  flex-shrink: 0;
}
.secret-value {
  font-size: 0.72rem;
  color: var(--text-2);
  word-break: break-all;
  flex: 1;
  min-width: 0;
}

.member-note {
  margin: -2px 0 0;
  font-size: 0.78rem;
  color: var(--text-mute);
  text-wrap: pretty;
}
.all-check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.78rem;
  color: var(--text-2);
  cursor: pointer;
}
.enabled-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.84rem;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .webhooks {
    padding: 24px 16px 64px;
  }
  .webhook-top {
    flex-wrap: wrap;
  }
  .webhook-actions {
    flex-wrap: wrap;
  }
}
</style>
