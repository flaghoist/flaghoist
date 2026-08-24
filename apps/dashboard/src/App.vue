<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ApiError, createApi, type Api, type FeatureFlag, type FlagInput } from './api'
import FlagEditor from './components/FlagEditor.vue'
import FlagRow from './components/FlagRow.vue'
import TokenGate from './components/TokenGate.vue'

const STORAGE = 'flaghoist.admin'
const THEME = 'flaghoist.theme'

type Filter = 'all' | 'live' | 'paused' | 'targeted'

const api = ref<Api | null>(null)
const serverUrl = ref('')
const flags = ref<FeatureFlag[]>([])
const loading = ref(true)
const connecting = ref(false)
const gateError = ref('')
/**
 * A message above the list. Errors and confirmations share the strip but not the treatment: an
 * error interrupts with role="alert", a confirmation reports with role="status", which is what
 * a screen reader should do with each.
 */
type Notice = { text: string; tone: 'ok' | 'error' }
const notice = ref<Notice | null>(null)
const busy = ref<Set<string>>(new Set())

const query = ref('')
const filter = ref<Filter>('all')
const filters: Filter[] = ['all', 'live', 'paused', 'targeted']
const searchEl = ref<HTMLInputElement | null>(null)

function clearFilters() {
  query.value = ''
  filter.value = 'all'
}

const editor = ref<{ flag: FeatureFlag | null } | null>(null)
const editorBusy = ref(false)
const editorError = ref('')

const theme = ref<'light' | 'dark' | null>(null)

const sorted = computed(() => [...flags.value].sort((a, b) => a.key.localeCompare(b.key)))

const counts = computed(() => ({
  all: flags.value.length,
  live: flags.value.filter((f) => f.enabled && f.rollout.percentage > 0).length,
  paused: flags.value.filter((f) => !f.enabled || f.rollout.percentage === 0).length,
  targeted: flags.value.filter((f) => (f.rules?.length ?? 0) > 0).length,
}))

/** Would this flag survive the filter and search that are active right now? */
function matchesActiveView(flag: FeatureFlag): boolean {
  const q = query.value.trim().toLowerCase()
  if (q && !flag.key.toLowerCase().includes(q) && !flag.description?.toLowerCase().includes(q)) {
    return false
  }
  if (filter.value === 'live') return flag.enabled && flag.rollout.percentage > 0
  if (filter.value === 'paused') return !flag.enabled || flag.rollout.percentage === 0
  if (filter.value === 'targeted') return (flag.rules?.length ?? 0) > 0
  return true
}

const visible = computed(() => sorted.value.filter(matchesActiveView))

/* ---- theme ---------------------------------------------------------------- */

function resolvedTheme(): 'light' | 'dark' {
  if (theme.value) return theme.value
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function toggleTheme() {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark'
  theme.value = next
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem(THEME, next)
  } catch {
    /* private mode: the choice just does not persist */
  }
}

/* ---- connection ----------------------------------------------------------- */

function describe(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Unauthorized. Check the admin token.'
    if (e.status === 403) return 'Forbidden. This token lacks admin access.'
    if (e.status === 0 || e.status === 408) return e.message
    return e.message || `Server error (${e.status}).`
  }
  return 'Something went wrong.'
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
    loading.value = false
  }
}

function disconnect(message = '') {
  localStorage.removeItem(STORAGE)
  api.value = null
  flags.value = []
  notice.value = null
  gateError.value = message
}

/* ---- mutations ------------------------------------------------------------ */

function replaceFlag(updated: FeatureFlag) {
  const i = flags.value.findIndex((f) => f.key === updated.key)
  if (i >= 0) flags.value[i] = updated
  else flags.value.push(updated)
}

/**
 * A 401 mid-session means the token expired or was revoked. Staying on the list would leave every
 * later action failing with no way back, so the session ends and the gate explains why.
 */
function handle(e: unknown): string {
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
    disconnect('Your session ended: the server rejected the admin token. Sign in again.')
    return ''
  }
  return describe(e)
}

async function withBusy(key: string, fn: () => Promise<void>) {
  busy.value = new Set(busy.value).add(key)
  notice.value = null
  try {
    await fn()
  } catch (e) {
    notice.value = { text: handle(e), tone: 'error' }
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
  const creating = editor.value?.flag == null
  editorBusy.value = true
  editorError.value = ''
  try {
    const saved = await api.value!.save(key, input)
    replaceFlag(saved)
    // A new flag that does not match the active filter is saved and then immediately hidden, which
    // reads as the save having silently failed. Creating a live flag while the paused chip is
    // selected did exactly that. Drop the filter so the thing you just made is visible, and say so.
    if (creating) {
      // The list is alphabetical, so a new flag can land below the fold and the closing modal is
      // the only sign anything happened. Confirm it either way, and say when the filter moved.
      const hidden = !matchesActiveView(saved)
      if (hidden) clearFilters()
      notice.value = {
        text: hidden
          ? `Created "${saved.key}". Filters were cleared so you can see it.`
          : `Created "${saved.key}".`,
        tone: 'ok',
      }
    }
    editor.value = null
  } catch (e) {
    const msg = handle(e)
    if (!api.value)
      editor.value = null // session ended underneath us
    else editorError.value = msg
  } finally {
    editorBusy.value = false
  }
}

/* ---- keyboard ------------------------------------------------------------- */

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)

  if (e.key === 'Escape') {
    if (editor.value) editor.value = null
    else if (query.value) query.value = ''
    else if (typing) (el as HTMLElement).blur()
    return
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return
  if (!api.value) return

  if (e.key === '/') {
    e.preventDefault()
    searchEl.value?.focus()
  } else if (e.key === 'n') {
    e.preventDefault()
    editor.value = { flag: null }
  }
}

onMounted(() => {
  try {
    const t = localStorage.getItem(THEME)
    if (t === 'light' || t === 'dark') theme.value = t
  } catch {
    /* private mode */
  }

  window.addEventListener('keydown', onKey)

  const saved = localStorage.getItem(STORAGE)
  if (!saved) {
    loading.value = false
    return
  }
  try {
    const { url, token } = JSON.parse(saved) as { url: string; token: string }
    void connect(url, token, false)
  } catch {
    localStorage.removeItem(STORAGE)
    loading.value = false
  }
})

onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <TokenGate
    v-if="!api"
    :error="gateError"
    :connecting="connecting"
    :theme="resolvedTheme()"
    @connect="(u, t) => connect(u, t)"
    @toggle-theme="toggleTheme"
  />

  <div v-else class="shell">
    <header class="topbar">
      <div class="brand">
        <svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="16" cy="9" r="3" fill="currentColor" />
          <rect x="14.25" y="9" width="3.5" height="48" rx="1.75" fill="currentColor" />
          <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="var(--signal)" />
        </svg>
        <span class="wordmark">Flag<span>hoist</span></span>
      </div>

      <span class="server mono" :title="serverUrl">{{ serverUrl }}</span>

      <div class="topbar-actions">
        <button
          class="icon-btn"
          :aria-label="
            resolvedTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          "
          @click="toggleTheme"
        >
          <svg v-if="resolvedTheme() === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.4" />
            <path
              d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" />
          </svg>
        </button>
        <button class="btn btn-ghost btn-sm" @click="disconnect()">Disconnect</button>
        <button class="btn btn-primary btn-sm" @click="editor = { flag: null }">New flag</button>
      </div>
    </header>

    <main class="content">
      <div class="toolbar">
        <div class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true" class="search-icon">
            <circle cx="11" cy="11" r="6.4" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref="searchEl"
            v-model="query"
            type="search"
            placeholder="Search flags"
            aria-label="Search flags"
          />
          <kbd v-if="!query">/</kbd>
        </div>

        <div class="filters" role="group" aria-label="Filter flags">
          <button
            v-for="f in filters"
            :key="f"
            class="chip"
            :class="{ on: filter === f }"
            :aria-pressed="filter === f"
            @click="filter = f"
          >
            {{ f }}<span class="chip-n">{{ counts[f] }}</span>
          </button>
        </div>
      </div>

      <p
        v-if="notice"
        class="notice"
        :class="notice.tone"
        :role="notice.tone === 'error' ? 'alert' : 'status'"
      >
        {{ notice.text }}
      </p>

      <!-- Skeleton rows rather than a spinner: the shape of what is coming, in place. -->
      <div v-if="loading" class="list" aria-busy="true" aria-label="Loading flags">
        <div v-for="i in 3" :key="i" class="skeleton-row">
          <div class="sk sk-key"></div>
          <div class="sk sk-desc"></div>
          <div class="sk sk-bar"></div>
        </div>
      </div>

      <div v-else-if="flags.length === 0" class="blank">
        <h2>No flags yet</h2>
        <p>
          Create one here, or from the CLI with <code class="mono">flaghoist flag create</code>.
        </p>
        <button class="btn btn-primary" @click="editor = { flag: null }">Create a flag</button>
      </div>

      <div v-else-if="visible.length === 0" class="blank">
        <h2>Nothing matches</h2>
        <p>
          No flag matches
          <template v-if="query"
            >“<strong>{{ query }}</strong
            >”</template
          >
          <template v-if="query && filter !== 'all'"> in </template>
          <template v-if="filter !== 'all'"
            ><strong>{{ filter }}</strong></template
          >.
        </p>
        <button class="btn btn-ghost" @click="clearFilters">Clear filters</button>
      </div>

      <div v-else class="list">
        <FlagRow
          v-for="flag in visible"
          :key="flag.key"
          :flag="flag"
          :busy="busy.has(flag.key)"
          @toggle="toggle(flag)"
          @rollout="(p: number) => setRollout(flag, p)"
          @edit="editor = { flag }"
          @remove="removeFlag(flag)"
        />
      </div>

      <p v-if="!loading && flags.length > 0" class="hintbar">
        <kbd>/</kbd> search · <kbd>n</kbd> new flag · <kbd>esc</kbd> clear
      </p>
    </main>

    <FlagEditor
      v-if="editor"
      :flag="editor.flag"
      :busy="editorBusy"
      :error="editorError"
      :existing-keys="flags.map((f) => f.key)"
      @save="saveFromEditor"
      @cancel="editor = null"
    />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
}

/* ---- topbar ---- */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem 1.2rem;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text);
}
.wordmark {
  font-size: 1.02rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.wordmark span {
  color: var(--signal);
}
.server {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  color: var(--text-mute);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: none;
  color: var(--text-2);
  transition:
    color 0.12s,
    background 0.12s;
}
.icon-btn:hover {
  color: var(--text);
  background: var(--accent-wash);
}
.icon-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

/* ---- content ---- */
.content {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.4rem 1.2rem 4rem;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-bottom: 1.1rem;
}
.search {
  position: relative;
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 0.6rem;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: var(--text-mute);
  stroke-width: 1.8;
  stroke-linecap: round;
  pointer-events: none;
}
.search input {
  width: 100%;
  padding-left: 2rem;
}
.search input::-webkit-search-cancel-button {
  -webkit-appearance: none;
}
.search kbd,
.hintbar kbd {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-mute);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.04rem 0.28rem;
}
.search kbd {
  position: absolute;
  right: 0.5rem;
  pointer-events: none;
}
.filters {
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
  text-transform: capitalize;
  color: var(--text-2);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  padding: 0.3rem 0.7rem;
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
.chip-n {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  opacity: 0.75;
}

.notice {
  margin: 0 0 0.9rem;
  padding: 0.6rem 0.8rem;
  font-size: 0.82rem;
  border-radius: var(--r-sm);
}
.notice.error {
  color: var(--red-text);
  background: var(--red-wash);
}
.notice.ok {
  color: var(--green-text);
  background: var(--green-wash);
}

/* Hairline list rather than a stack of cards: denser, and the eye tracks one column of keys. */
.list {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
}

/* ---- states ---- */
.blank {
  text-align: center;
  padding: 3.5rem 2rem;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
}
.blank h2 {
  font-size: 1.05rem;
}
.blank p {
  margin: 0.4rem 0 1.1rem;
  font-size: 0.88rem;
  color: var(--text-2);
}
.blank code {
  font-size: 0.85em;
  background: var(--accent-wash);
  padding: 0.08rem 0.32rem;
  border-radius: 4px;
}
.skeleton-row {
  padding: 0.95rem 1rem;
  border-bottom: 1px solid var(--line-soft);
}
.skeleton-row:last-child {
  border-bottom: 0;
}
.sk {
  height: 9px;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--line-soft) 25%, var(--line) 37%, var(--line-soft) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
.sk-key {
  width: 30%;
}
.sk-desc {
  width: 55%;
  margin-top: 0.55rem;
  height: 7px;
}
.sk-bar {
  width: 100%;
  margin-top: 0.8rem;
  height: 4px;
}
@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}

.hintbar {
  margin: 1rem 0 0;
  text-align: center;
  font-size: 0.74rem;
  color: var(--text-mute);
}

@media (max-width: 640px) {
  .server {
    display: none;
  }
  .topbar {
    flex-wrap: wrap;
  }
}
</style>
