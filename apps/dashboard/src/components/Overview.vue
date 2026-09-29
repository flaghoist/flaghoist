<script setup lang="ts">
import { computed } from 'vue'
import type { FeatureFlag } from '../api'

const props = defineProps<{
  flags: FeatureFlag[]
  serverUrl: string
  token: string
  /** Show toggles without letting them change anything, for the viewer role. */
  readOnly?: boolean
}>()

const emit = defineEmits<{
  navigate: [view: string]
  toggle: [flag: FeatureFlag]
  newFlag: []
}>()

const live = computed(() => props.flags.filter((f) => f.enabled && f.rollout.percentage > 0))
const paused = computed(() => props.flags.filter((f) => !f.enabled || f.rollout.percentage === 0))
const targeted = computed(() => props.flags.filter((f) => (f.rules?.length ?? 0) > 0))

const stats = computed(() => [
  { label: 'Total flags', value: props.flags.length, dot: 'neutral', view: 'flags' },
  { label: 'Live', value: live.value.length, dot: 'green', view: 'flags' },
  { label: 'Paused', value: paused.value.length, dot: 'mute', view: 'flags' },
  { label: 'Targeted', value: targeted.value.length, dot: 'accent', view: 'flags' },
])

const liveShare = computed(() =>
  props.flags.length === 0 ? 0 : Math.round((live.value.length / props.flags.length) * 100),
)

const summary = computed(() => {
  const n = props.flags.length
  if (n === 0) return 'No flags yet.'
  return `${n} flag${n === 1 ? '' : 's'}, ${live.value.length} serving traffic right now.`
})

const shortcuts = computed(() => [
  ...(props.readOnly ? [] : [{ label: 'New flag', keys: ['n'], action: () => emit('newFlag') }]),
  { label: 'Search flags', keys: ['/'], action: () => emit('navigate', 'flags') },
  { label: 'Go to audit log', keys: ['g', 'a'], action: () => emit('navigate', 'audit') },
  { label: 'Go to settings', keys: ['g', 's'], action: () => emit('navigate', 'settings') },
])

const recentlyChanged = computed(() =>
  [...props.flags]
    .sort((a, b) => b.metadata.updatedAt.localeCompare(a.metadata.updatedAt))
    .slice(0, 5),
)

function isLive(f: FeatureFlag): boolean {
  return f.enabled && f.rollout.percentage > 0
}

function meta(f: FeatureFlag): string {
  return `Updated ${formatTime(f.metadata.updatedAt)}${
    f.metadata.updatedBy ? ` by ${f.metadata.updatedBy}` : ''
  }`
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
</script>

<template>
  <main class="overview">
    <div class="page-head-text">
      <h1 class="page-title">Overview</h1>
      <p class="page-sub">{{ summary }}</p>
    </div>

    <div v-if="flags.length === 0" class="empty-state">
      <div class="empty-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </div>
      <h2>No flags yet</h2>
      <p>Create your first flag to control what your users see without a deploy.</p>
      <button v-if="!readOnly" class="ck-btn ck-btn--solid ck-btn--md" @click="emit('newFlag')">
        Create a flag
      </button>
    </div>

    <template v-else>
      <!-- Counts, with a live/paused split bar underneath. -->
      <section class="stat-panel">
        <div class="stat-grid">
          <button
            v-for="s in stats"
            :key="s.label"
            class="stat-cell"
            @click="emit('navigate', s.view)"
          >
            <span class="stat-label"
              ><span class="stat-dot" :class="s.dot"></span>{{ s.label }}</span
            >
            <span class="stat-value mono">{{ s.value }}</span>
          </button>
        </div>
        <div class="live-meter">
          <div class="live-track">
            <div class="live-fill" :style="{ width: `${liveShare}%` }"></div>
          </div>
          <div class="live-legend mono">
            <span>{{ liveShare }}% serving traffic</span>
            <span>{{ 100 - liveShare }}% paused</span>
          </div>
        </div>
      </section>

      <div class="two-col">
        <section class="ck-card ck-card--outline recent">
          <div class="card-head">
            <h2>Recently changed</h2>
            <a href="#" class="card-link" @click.prevent="emit('navigate', 'audit')"
              >View audit log</a
            >
          </div>
          <div v-for="flag in recentlyChanged" :key="flag.key" class="recent-row">
            <div class="recent-main">
              <div class="recent-title">
                <span class="recent-dot" :class="isLive(flag) ? 'green' : 'mute'"></span>
                <code class="mono recent-key">{{ flag.key }}</code>
                <span v-if="(flag.rules?.length ?? 0) > 0" class="rule-tag mono">
                  {{ flag.rules!.length }} rule{{ flag.rules!.length === 1 ? '' : 's' }}
                </span>
              </div>
              <span class="recent-meta">{{ meta(flag) }}</span>
            </div>
            <div class="recent-rollout">
              <div class="mini-bar">
                <div class="mini-fill" :style="{ width: `${flag.rollout.percentage}%` }"></div>
              </div>
              <span class="mini-pct mono">{{ flag.rollout.percentage }}%</span>
            </div>
            <button
              class="toggle toggle-sm"
              :data-on="flag.enabled"
              :aria-label="flag.enabled ? `Disable ${flag.key}` : `Enable ${flag.key}`"
              :disabled="readOnly"
              @click="emit('toggle', flag)"
            ></button>
          </div>
        </section>

        <section class="shortcuts">
          <h2 class="shortcuts-title">Shortcuts</h2>
          <button v-for="s in shortcuts" :key="s.label" class="shortcut" @click="s.action()">
            <span>{{ s.label }}</span>
            <span class="shortcut-keys">
              <kbd v-for="k in s.keys" :key="k" class="kbd">{{ k }}</kbd>
            </span>
          </button>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.overview {
  flex: 1;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 36px 32px 64px;
  display: flex;
  flex-direction: column;
  gap: 28px;
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

/* ---- stat panel ---- */
.stat-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.stat-cell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  padding: 22px 24px;
  border: none;
  border-right: 1px solid var(--line-soft);
  background: transparent;
  text-align: left;
  transition: background 0.12s;
}
.stat-cell:last-child {
  border-right: none;
}
.stat-cell:hover {
  background: var(--surface-2);
}
.stat-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-mute);
}
.stat-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--r-pill);
  flex-shrink: 0;
}
.stat-dot.green {
  background: var(--green);
}
.stat-dot.mute {
  background: var(--text-mute);
}
.stat-dot.accent {
  background: var(--signal);
}
.stat-dot.neutral {
  background: var(--text-2);
}
.stat-value {
  font-size: 2.25rem;
  font-weight: 500;
  letter-spacing: -0.04em;
  line-height: 1.1;
  color: var(--text);
}
.live-meter {
  padding: 0 24px 22px;
}
.live-track {
  display: flex;
  height: 6px;
  border-radius: var(--r-pill);
  overflow: hidden;
  background: var(--track);
}
.live-fill {
  background: var(--green);
  transition: width 0.3s ease;
}
.live-legend {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 0.69rem;
  color: var(--text-mute);
}

/* ---- two column ---- */
.two-col {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}
.recent {
  flex: 1 1 440px;
  min-width: 0;
  overflow: hidden;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 22px;
  border-bottom: 1px solid var(--line-soft);
}
.card-head h2 {
  font-size: 0.875rem;
  font-weight: 600;
}
.card-link {
  font-size: 0.78rem;
  font-weight: 500;
}
.recent-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(80px, 150px) 32px;
  align-items: center;
  gap: 18px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--line-soft);
}
.recent-row:last-child {
  border-bottom: none;
}
.recent-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.recent-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.recent-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--r-pill);
  flex-shrink: 0;
}
.recent-dot.green {
  background: var(--green);
}
.recent-dot.mute {
  background: var(--text-mute);
}
.recent-key {
  font-size: 0.84rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rule-tag {
  font-size: 0.66rem;
  color: var(--accent-text);
  background: var(--accent-wash);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.recent-meta {
  font-size: 0.75rem;
  color: var(--text-mute);
  padding-left: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-rollout {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mini-bar {
  flex: 1;
  height: 4px;
  border-radius: var(--r-pill);
  background: var(--track);
  overflow: hidden;
}
.mini-fill {
  height: 100%;
  background: var(--signal);
  border-radius: var(--r-pill);
  transition: width 0.2s ease;
}
.mini-pct {
  font-size: 0.75rem;
  font-weight: 500;
  width: 34px;
  text-align: right;
  color: var(--text-2);
}

/* ---- shortcuts ---- */
.shortcuts {
  flex: 1 1 260px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.shortcuts-title {
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0 2px;
}
.shortcut {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-size: 0.84rem;
  font-weight: 500;
  text-align: left;
  transition: border-color 0.12s;
}
.shortcut:hover {
  border-color: var(--signal);
}
.shortcut span:first-child {
  flex: 1;
}
.shortcut-keys {
  display: flex;
  gap: 4px;
}

/* ---- empty ---- */
.empty-state {
  text-align: center;
  padding: 64px 24px;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
  align-items: center;
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
.empty-state h2 {
  font-size: 0.95rem;
  font-weight: 600;
}
.empty-state p {
  margin: 0 0 12px;
  font-size: 0.85rem;
  color: var(--text-mute);
  max-width: 360px;
}

@media (max-width: 640px) {
  .overview {
    padding: 24px 16px 64px;
  }
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .stat-cell:nth-child(2) {
    border-right: none;
  }
  .stat-cell:nth-child(1),
  .stat-cell:nth-child(2) {
    border-bottom: 1px solid var(--line-soft);
  }
}
</style>
