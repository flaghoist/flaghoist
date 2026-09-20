<script setup lang="ts">
defineProps<{
  view: string
  collapsed: boolean
  serverUrl: string
  sessionAge: string
  theme: 'light' | 'dark'
  counts: { all: number; live: number; paused: number }
  environments: string[]
  currentEnvironment: string
}>()

const emit = defineEmits<{
  navigate: [view: string]
  disconnect: []
  toggleTheme: []
  toggleCollapse: []
  switchEnvironment: [environment: string]
}>()

const nav = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'flags', label: 'Flags', icon: 'flag' },
  { id: 'webhooks', label: 'Webhooks', icon: 'webhook' },
  { id: 'audit', label: 'Audit log', icon: 'clock' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
  { id: 'logout', label: 'Log out', icon: 'logout' },
]
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }" role="navigation" aria-label="Main navigation">
    <div class="sidebar-top">
      <div class="brand" @click="emit('navigate', 'overview')">
        <svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="16" cy="9" r="3" fill="currentColor" />
          <rect x="14.25" y="9" width="3.5" height="48" rx="1.75" fill="currentColor" />
          <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="var(--signal)" />
        </svg>
        <span v-if="!collapsed" class="wordmark">Flag<span>hoist</span></span>
      </div>

      <button
        class="collapse-btn"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="emit('toggleCollapse')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-if="collapsed" d="M9 18l6-6-6-6" />
          <path v-else d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    </div>

    <div v-if="!collapsed && environments.length > 1" class="env-switcher">
      <label class="env-label" for="env-select">Environment</label>
      <select
        id="env-select"
        class="env-select"
        :value="currentEnvironment"
        @change="emit('switchEnvironment', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="env in environments" :key="env" :value="env">{{ env }}</option>
      </select>
    </div>

    <nav class="nav-list">
      <button
        v-for="item in nav"
        :key="item.id"
        class="nav-item"
        :class="{ active: view === item.id, 'nav-logout': item.id === 'logout' }"
        :aria-current="view === item.id ? 'page' : undefined"
        :title="collapsed ? item.label : undefined"
        @click="item.id === 'logout' ? emit('disconnect') : emit('navigate', item.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" class="nav-icon">
          <template v-if="item.icon === 'grid'">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </template>
          <template v-if="item.icon === 'flag'">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </template>
          <template v-if="item.icon === 'clock'">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
          </template>
          <template v-if="item.icon === 'webhook'">
            <path d="M12 2a4 4 0 0 0-3.46 6L3 18h6l3-5.2L15 18h6l-5.54-10A4 4 0 0 0 12 2z" />
          </template>
          <template v-if="item.icon === 'gear'">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </template>
          <template v-if="item.icon === 'logout'">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </template>
        </svg>
        <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
        <span v-if="!collapsed && item.id === 'flags' && counts.all > 0" class="nav-badge mono">{{
          counts.all
        }}</span>
      </button>
    </nav>

    <div class="sidebar-bottom">
      <div v-if="!collapsed" class="server-info">
        <span class="server-url mono" :title="serverUrl">{{ serverUrl }}</span>
        <span v-if="sessionAge" class="session-age">{{ sessionAge }}</span>
      </div>

      <div class="bottom-actions">
        <button
          class="icon-btn"
          :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="collapsed ? (theme === 'dark' ? 'Light theme' : 'Dark theme') : undefined"
          @click="emit('toggleTheme')"
        >
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.4" />
            <path
              d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" />
          </svg>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 220px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
  z-index: 20;
  transition: width 0.2s ease;
}
.sidebar.collapsed {
  width: 56px;
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.75rem 0.5rem;
  min-height: 52px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text);
  cursor: pointer;
}
.wordmark {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.wordmark span {
  color: var(--signal);
}
.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  color: var(--text-mute);
  padding: 0;
  flex-shrink: 0;
}
.collapse-btn:hover {
  color: var(--text);
  background: var(--accent-wash);
}
.collapse-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.env-switcher {
  padding: 0.3rem 0.75rem 0.5rem;
}
.env-label {
  display: block;
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-mute);
  margin-bottom: 0.25rem;
}
.env-select {
  width: 100%;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0.32rem 0.5rem;
  text-transform: capitalize;
}
.env-select:focus {
  outline: none;
  border-color: var(--signal);
}

.nav-list {
  flex: 1;
  padding: 0.25rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.6rem;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  color: var(--text-2);
  font-size: 0.84rem;
  font-weight: 500;
  text-align: left;
  width: 100%;
  transition:
    color 0.12s,
    background 0.12s;
}
.nav-item:hover {
  color: var(--text);
  background: var(--surface-2);
}
.nav-item.active {
  color: var(--text);
  background: var(--accent-wash);
}
.nav-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.nav-item.active .nav-icon {
  color: var(--signal);
}
.nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-badge {
  font-size: 0.68rem;
  color: var(--text-mute);
  background: var(--surface-2);
  padding: 0.08rem 0.38rem;
  border-radius: var(--r-pill);
}

.sidebar-bottom {
  padding: 0.6rem 0.65rem 0.75rem;
  border-top: 1px solid var(--line-soft);
}
.server-info {
  margin-bottom: 0.5rem;
  padding: 0 0.15rem;
}
.server-url {
  display: block;
  font-size: 0.68rem;
  color: var(--text-mute);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-age {
  font-size: 0.66rem;
  color: var(--text-mute);
}
.bottom-actions {
  display: flex;
  gap: 0.25rem;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  color: var(--text-2);
  padding: 0;
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
  stroke-linejoin: round;
}
.nav-logout {
  margin-top: auto;
}
.nav-logout:hover {
  color: var(--red-text);
  background: var(--red-wash);
}
.nav-logout:hover .nav-icon {
  color: var(--red-text);
}

.collapsed .sidebar-top {
  justify-content: center;
  padding: 0.75rem 0.4rem 0.5rem;
}
.collapsed .brand {
  justify-content: center;
}
.collapsed .collapse-btn {
  position: absolute;
  top: 0.5rem;
  right: -12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  z-index: 21;
}
.collapsed .collapse-btn:hover {
  background: var(--accent-wash);
}
.collapsed .nav-list {
  padding: 0.25rem 0.35rem;
}
.collapsed .nav-item {
  justify-content: center;
  padding: 0.55rem;
}
.collapsed .bottom-actions {
  flex-direction: column;
  align-items: center;
}
</style>
