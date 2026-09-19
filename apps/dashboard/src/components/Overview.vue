<script setup lang="ts">
import { computed } from 'vue'
import type { FeatureFlag } from '../api'

const props = defineProps<{
  flags: FeatureFlag[]
  serverUrl: string
  token: string
}>()

const emit = defineEmits<{
  navigate: [view: string]
  toggle: [flag: FeatureFlag]
}>()

const live = computed(() => props.flags.filter((f) => f.enabled && f.rollout.percentage > 0))
const paused = computed(() => props.flags.filter((f) => !f.enabled || f.rollout.percentage === 0))
const targeted = computed(() => props.flags.filter((f) => (f.rules?.length ?? 0) > 0))

const recentlyChanged = computed(() =>
  [...props.flags]
    .sort((a, b) => b.metadata.updatedAt.localeCompare(a.metadata.updatedAt))
    .slice(0, 5),
)

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
  <div class="overview">
    <h1 class="page-title">Overview</h1>

    <div class="stat-grid">
      <button class="stat-card" @click="emit('navigate', 'flags')">
        <span class="stat-n">{{ flags.length }}</span>
        <span class="stat-label">Total flags</span>
      </button>
      <button class="stat-card live" @click="emit('navigate', 'flags')">
        <span class="stat-n">{{ live.length }}</span>
        <span class="stat-label">Live</span>
      </button>
      <button class="stat-card paused" @click="emit('navigate', 'flags')">
        <span class="stat-n">{{ paused.length }}</span>
        <span class="stat-label">Paused</span>
      </button>
      <button class="stat-card targeted" @click="emit('navigate', 'flags')">
        <span class="stat-n">{{ targeted.length }}</span>
        <span class="stat-label">Targeted</span>
      </button>
    </div>

    <div v-if="flags.length === 0" class="empty-state">
      <svg class="empty-illus" viewBox="0 0 120 100" aria-hidden="true">
        <rect
          x="15"
          y="30"
          width="90"
          height="50"
          rx="6"
          fill="var(--surface-2)"
          stroke="var(--line)"
          stroke-width="1.5"
        />
        <circle
          cx="35"
          cy="55"
          r="8"
          fill="var(--accent-wash)"
          stroke="var(--signal)"
          stroke-width="1.5"
        />
        <line
          x1="52"
          y1="50"
          x2="90"
          y2="50"
          stroke="var(--line)"
          stroke-width="3"
          stroke-linecap="round"
        />
        <line
          x1="52"
          y1="60"
          x2="78"
          y2="60"
          stroke="var(--line-soft)"
          stroke-width="2"
          stroke-linecap="round"
        />
        <path d="M58 15 l4 12 -8 0 z" fill="var(--signal)" opacity="0.7" />
        <path d="M75 18 l3 9 -6 0 z" fill="var(--signal)" opacity="0.4" />
      </svg>
      <h2>No flags yet</h2>
      <p>
        Create your first feature flag to get started. Flags let you control what your users see
        without redeploying.
      </p>
      <button class="btn btn-primary" @click="emit('navigate', 'flags')">Go to Flags</button>
    </div>

    <template v-else>
      <section class="section">
        <div class="section-head">
          <h2>Recently changed</h2>
          <button class="btn btn-ghost btn-sm" @click="emit('navigate', 'audit')">
            View audit log
          </button>
        </div>

        <div class="recent-list">
          <div v-for="flag in recentlyChanged" :key="flag.key" class="recent-row">
            <div class="recent-main">
              <code class="mono recent-key">{{ flag.key }}</code>
              <span class="badge" :class="flag.enabled ? 'badge-on' : 'badge-off'">
                {{ flag.enabled ? 'on' : 'off' }}
              </span>
            </div>
            <span class="recent-time">{{ formatTime(flag.metadata.updatedAt) }}</span>
            <button
              class="toggle toggle-sm"
              :data-on="flag.enabled"
              :aria-label="flag.enabled ? `Disable ${flag.key}` : `Enable ${flag.key}`"
              @click="emit('toggle', flag)"
            ></button>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Quick actions</h2>
        </div>
        <div class="quick-grid">
          <button class="quick-card" @click="emit('navigate', 'flags')">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="quick-icon">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New flag</span>
          </button>
          <button class="quick-card" @click="emit('navigate', 'audit')">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="quick-icon">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 2" />
            </svg>
            <span>Audit log</span>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.overview {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.4rem 1.2rem 4rem;
}
.page-title {
  font-size: 1.2rem;
  margin-bottom: 1.2rem;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  text-align: center;
  transition:
    border-color 0.12s,
    background 0.12s;
}
.stat-card:hover {
  border-color: var(--text-mute);
  background: var(--surface-2);
}
.stat-n {
  font-size: 1.6rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text);
}
.stat-card.live .stat-n {
  color: var(--green-text);
}
.stat-card.paused .stat-n {
  color: var(--text-mute);
}
.stat-card.targeted .stat-n {
  color: var(--accent-text);
}
.stat-label {
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.section {
  margin-bottom: 1.5rem;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.7rem;
}
.section-head h2 {
  font-size: 0.92rem;
}

.recent-list {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
}
.recent-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--line-soft);
}
.recent-row:last-child {
  border-bottom: none;
}
.recent-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.recent-key {
  font-size: 0.84rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-time {
  font-size: 0.72rem;
  color: var(--text-mute);
  white-space: nowrap;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
.quick-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  font-size: 0.84rem;
  font-weight: 500;
  color: var(--text-2);
  text-align: left;
  transition:
    border-color 0.12s,
    color 0.12s;
}
.quick-card:hover {
  border-color: var(--signal);
  color: var(--text);
}
.quick-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.empty-state {
  text-align: center;
  padding: 3rem 2rem;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
}
.empty-illus {
  width: 120px;
  height: 100px;
  margin-bottom: 1rem;
}
.empty-state h2 {
  font-size: 1.05rem;
  margin-bottom: 0.4rem;
}
.empty-state p {
  margin: 0 0 1.1rem;
  font-size: 0.86rem;
  color: var(--text-2);
  max-width: 360px;
  margin-inline: auto;
}

@media (max-width: 640px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
