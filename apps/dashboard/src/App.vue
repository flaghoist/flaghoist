<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, createApi, type Api, type FeatureFlag, type FlagInput } from './api'
import FlagEditor from './components/FlagEditor.vue'
import FlagRow from './components/FlagRow.vue'
import TokenGate from './components/TokenGate.vue'

const STORAGE = 'flaghoist.admin'

const api = ref<Api | null>(null)
const serverUrl = ref('')
const flags = ref<FeatureFlag[]>([])
const loading = ref(false)
const connecting = ref(false)
const gateError = ref('')
const busy = ref<Set<string>>(new Set())

const editor = ref<{ flag: FeatureFlag | null } | null>(null)
const editorBusy = ref(false)
const editorError = ref('')

const sortedFlags = computed(() => [...flags.value].sort((a, b) => a.key.localeCompare(b.key)))

onMounted(() => {
  const saved = localStorage.getItem(STORAGE)
  if (!saved) return
  try {
    const { url, token } = JSON.parse(saved) as { url: string; token: string }
    void connect(url, token, false)
  } catch {
    localStorage.removeItem(STORAGE)
  }
})

function describe(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Unauthorized — check the admin token.'
    if (e.status === 403) return 'Forbidden — your token lacks admin access.'
    return `Server error (${e.status}). ${e.message}`.trim()
  }
  return 'Could not reach the server. Check the URL and its CORS allowlist.'
}

async function connect(url: string, token: string, persist = true) {
  connecting.value = true
  gateError.value = ''
  const client = createApi(url, token)
  try {
    flags.value = await client.list()
    api.value = client
    serverUrl.value = url
    if (persist) localStorage.setItem(STORAGE, JSON.stringify({ url, token }))
  } catch (e) {
    gateError.value = describe(e)
    api.value = null
  } finally {
    connecting.value = false
  }
}

function disconnect() {
  localStorage.removeItem(STORAGE)
  api.value = null
  flags.value = []
}

function replaceFlag(updated: FeatureFlag) {
  const i = flags.value.findIndex((f) => f.key === updated.key)
  if (i >= 0) flags.value[i] = updated
  else flags.value.push(updated)
}

async function withBusy(key: string, fn: () => Promise<void>) {
  busy.value = new Set(busy.value).add(key)
  try {
    await fn()
  } catch (e) {
    gateError.value = describe(e)
  } finally {
    const next = new Set(busy.value)
    next.delete(key)
    busy.value = next
  }
}

function inputFrom(flag: FeatureFlag, changes: Partial<FlagInput>): FlagInput {
  return {
    enabled: flag.enabled,
    rollout: flag.rollout,
    rules: flag.rules,
    description: flag.description,
    ...changes,
  }
}

function toggle(flag: FeatureFlag) {
  return withBusy(flag.key, async () => {
    replaceFlag(await api.value!.save(flag.key, inputFrom(flag, { enabled: !flag.enabled })))
  })
}

function setRollout(flag: FeatureFlag, pct: number) {
  return withBusy(flag.key, async () => {
    replaceFlag(await api.value!.save(flag.key, inputFrom(flag, { rollout: { percentage: pct } })))
  })
}

function removeFlag(flag: FeatureFlag) {
  if (!confirm(`Delete flag "${flag.key}"? This cannot be undone.`)) return
  return withBusy(flag.key, async () => {
    await api.value!.remove(flag.key)
    flags.value = flags.value.filter((f) => f.key !== flag.key)
  })
}

async function saveFromEditor(key: string, input: FlagInput) {
  editorBusy.value = true
  editorError.value = ''
  try {
    replaceFlag(await api.value!.save(key, input))
    editor.value = null
  } catch (e) {
    editorError.value = describe(e)
  } finally {
    editorBusy.value = false
  }
}
</script>

<template>
  <TokenGate
    v-if="!api"
    :error="gateError"
    :connecting="connecting"
    @connect="(u, t) => connect(u, t)"
  />

  <div v-else class="shell">
    <header class="topbar">
      <div class="brand">
        <svg width="30" height="30" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="16" cy="9" r="3" fill="var(--ink)" />
          <line
            x1="16"
            y1="9"
            x2="16"
            y2="57"
            stroke="var(--ink)"
            stroke-width="3.5"
            stroke-linecap="round"
          />
          <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="var(--signal)" />
        </svg>
        <span class="wordmark">Flag<span>hoist</span></span>
        <span class="tag mono">admin</span>
      </div>
      <div class="topbar-right">
        <span class="server mono">{{ serverUrl }}</span>
        <button class="btn btn-primary" @click="editor = { flag: null }">+ New flag</button>
        <button class="btn btn-ghost" @click="disconnect">Disconnect</button>
      </div>
    </header>

    <svg class="bunting" width="100%" height="13" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="pennants" width="54" height="13" patternUnits="userSpaceOnUse">
          <polygon points="0,0 18,0 9,13" fill="var(--ink)" />
          <polygon points="18,0 36,0 27,13" fill="var(--signal)" />
          <polygon points="36,0 54,0 45,13" fill="var(--on)" />
        </pattern>
      </defs>
      <rect width="100%" height="13" fill="url(#pennants)" />
    </svg>

    <main class="content">
      <div v-if="sortedFlags.length === 0" class="empty card">
        <p>{{ loading ? 'Loading…' : 'No flags yet.' }}</p>
        <button v-if="!loading" class="btn btn-primary" @click="editor = { flag: null }">
          Create your first flag
        </button>
      </div>

      <div class="list">
        <FlagRow
          v-for="flag in sortedFlags"
          :key="flag.key"
          :flag="flag"
          :busy="busy.has(flag.key)"
          @toggle="toggle(flag)"
          @rollout="(p: number) => setRollout(flag, p)"
          @edit="editor = { flag }"
          @remove="removeFlag(flag)"
        />
      </div>
    </main>

    <FlagEditor
      v-if="editor"
      :flag="editor.flag"
      :busy="editorBusy"
      :error="editorError"
      @save="saveFromEditor"
      @cancel="editor = null"
    />
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.6rem;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.wordmark {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.wordmark span {
  color: var(--signal);
}
.tag {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--slate);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 0.1rem 0.4rem;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
}
.server {
  font-size: 0.78rem;
  color: var(--slate);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bunting {
  display: block;
}
.content {
  max-width: 860px;
  margin: 0 auto;
  padding: 1.8rem 1.4rem 4rem;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.empty {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--slate);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
</style>
