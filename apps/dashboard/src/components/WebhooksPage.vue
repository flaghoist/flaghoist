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

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'flag.created': 'Created',
  'flag.updated': 'Updated',
  'flag.deleted': 'Deleted',
  'flag.archived': 'Archived',
  'flag.restored': 'Restored',
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

const allEventsSelected = computed(() => formEvents.value.size === ALL_EVENTS.length)

function toggleAllEvents() {
  if (allEventsSelected.value) {
    formEvents.value = new Set()
  } else {
    formEvents.value = new Set(ALL_EVENTS)
  }
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
  <div class="webhooks">
    <div class="webhooks-header">
      <h1 class="page-title">Webhooks</h1>
      <button class="btn btn-primary btn-sm" @click="openCreate">Add webhook</button>
    </div>

    <p class="webhooks-hint">
      Webhooks send a POST request to your URL when flag events occur. Each delivery includes an
      HMAC-SHA256 signature in the <code class="mono">X-Flaghoist-Signature</code> header.
    </p>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else-if="webhooks.length === 0 && !showForm" class="empty-state">
      <h2>No webhooks configured</h2>
      <p>Add a webhook to get notified when flags change.</p>
    </div>

    <div v-else class="webhook-list">
      <div v-for="hook in webhooks" :key="hook.id" class="webhook-card card">
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
          <div class="webhook-actions">
            <button
              class="btn btn-ghost btn-sm"
              :disabled="testingId === hook.id"
              @click="test(hook)"
            >
              {{ testingId === hook.id ? 'Sending...' : 'Test' }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="openEdit(hook)">Edit</button>
            <button class="btn btn-ghost btn-sm" @click="toggleEnabled(hook)">
              {{ hook.enabled ? 'Disable' : 'Enable' }}
            </button>
            <button class="btn btn-ghost btn-sm danger-hover" @click="remove(hook)">Delete</button>
          </div>
        </div>

        <div class="webhook-secret-row">
          <span class="secret-label">Signing secret</span>
          <code class="mono secret-value">{{
            revealedSecrets.has(hook.id) ? hook.secret : maskSecret(hook.secret)
          }}</code>
          <button class="btn btn-quiet btn-sm" @click="toggleSecret(hook.id)">
            {{ revealedSecrets.has(hook.id) ? 'Hide' : 'Reveal' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Create / Edit form -->
    <div v-if="showForm" class="webhook-form-overlay" @click.self="closeForm">
      <div class="webhook-form card" role="dialog" aria-labelledby="webhook-form-title">
        <h2 id="webhook-form-title">{{ editingId ? 'Edit webhook' : 'Add webhook' }}</h2>

        <label class="form-label">
          URL
          <input
            v-model="formUrl"
            type="url"
            class="form-input mono"
            placeholder="https://example.com/webhooks/flaghoist"
            required
          />
        </label>

        <fieldset class="form-fieldset">
          <legend class="form-label">Events</legend>
          <label class="event-check">
            <input type="checkbox" :checked="allEventsSelected" @change="toggleAllEvents" />
            <span>All events</span>
          </label>
          <div class="event-grid">
            <label v-for="ev in ALL_EVENTS" :key="ev" class="event-check">
              <input type="checkbox" :checked="formEvents.has(ev)" @change="toggleEvent(ev)" />
              <span>{{ EVENT_LABELS[ev] }}</span>
            </label>
          </div>
        </fieldset>

        <label class="event-check">
          <input type="checkbox" v-model="formEnabled" />
          <span>Enabled</span>
        </label>

        <div class="form-actions">
          <button class="btn btn-ghost btn-sm" @click="closeForm" :disabled="formBusy">
            Cancel
          </button>
          <button
            class="btn btn-primary btn-sm"
            @click="save"
            :disabled="formBusy || !formUrl.trim()"
          >
            {{ formBusy ? 'Saving...' : editingId ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.webhooks {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.4rem 1.2rem 4rem;
}
.webhooks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.page-title {
  font-size: 1.2rem;
}
.webhooks-hint {
  font-size: 0.8rem;
  color: var(--text-mute);
  margin: 0 0 1.4rem;
  line-height: 1.5;
}
.webhooks-hint code {
  font-size: 0.72rem;
  background: var(--surface-2);
  padding: 0.12rem 0.3rem;
  border-radius: 4px;
}

.loading {
  text-align: center;
  color: var(--text-mute);
  padding: 2rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-2);
}
.empty-state h2 {
  font-size: 1rem;
  margin-bottom: 0.4rem;
}
.empty-state p {
  font-size: 0.84rem;
  color: var(--text-mute);
}

.webhook-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.webhook-card {
  padding: 1rem 1.2rem;
}
.webhook-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
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
  font-size: 0.68rem;
  color: var(--text-mute);
  background: var(--surface-2);
  padding: 0.12rem 0.4rem;
  border-radius: var(--r-pill);
}
.webhook-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.webhook-secret-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.65rem;
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

/* Form overlay */
.webhook-form-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.webhook-form {
  width: min(480px, 90vw);
  padding: 1.4rem;
}
.webhook-form h2 {
  font-size: 1rem;
  margin: 0 0 1.2rem;
}

.form-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-2);
  margin-bottom: 0.9rem;
}
.form-input {
  display: block;
  width: 100%;
  margin-top: 0.3rem;
  padding: 0.5rem 0.6rem;
  font-size: 0.82rem;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  color: var(--text);
  outline: none;
}
.form-input:focus {
  border-color: var(--signal);
}

.form-fieldset {
  border: none;
  padding: 0;
  margin: 0 0 0.9rem;
}
.form-fieldset legend {
  margin-bottom: 0.4rem;
}
.event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.3rem;
  margin-top: 0.3rem;
}
.event-check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--text-2);
  cursor: pointer;
  margin-bottom: 0.3rem;
}
.event-check input[type='checkbox'] {
  accent-color: var(--signal);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.2rem;
}

@media (max-width: 640px) {
  .webhook-top {
    flex-direction: column;
  }
  .webhook-actions {
    flex-wrap: wrap;
  }
}
</style>
