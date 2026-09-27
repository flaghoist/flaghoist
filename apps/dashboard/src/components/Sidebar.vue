<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  view: string
  collapsed: boolean
  serverUrl: string
  sessionAge: string
  theme: 'light' | 'dark'
  counts: { all: number; live: number; paused: number }
  environments: string[]
  currentEnvironment: string
  /** Show the Account page: only on a server with accounts turned on. */
  showAccount?: boolean
  /** Webhooks and Members need the admin role; below it they are hidden. */
  showWebhooks?: boolean
  showMembers?: boolean
  /** The signed-in email, shown above the server URL. */
  accountLabel?: string
}>()

const emit = defineEmits<{
  navigate: [view: string]
  disconnect: []
  setTheme: [theme: 'light' | 'dark']
  toggleCollapse: []
  switchEnvironment: [environment: string]
}>()

type NavItem = { id: string; label: string; icon: string; badge?: boolean }

const workspace = computed<NavItem[]>(() => [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'flags', label: 'Flags', icon: 'flag', badge: true },
  ...(props.showWebhooks !== false ? [{ id: 'webhooks', label: 'Webhooks', icon: 'webhook' }] : []),
  { id: 'audit', label: 'Audit log', icon: 'clock' },
])

const team = computed<NavItem[]>(() => [
  ...(props.showMembers ? [{ id: 'members', label: 'Members', icon: 'users' }] : []),
  ...(props.showAccount ? [{ id: 'account', label: 'Account', icon: 'user' }] : []),
  { id: 'settings', label: 'Settings', icon: 'gear' },
])

/** The initial shown in the account avatar: the account's, else A for the admin token. */
const avatarInitial = computed(() => (props.accountLabel || 'A').trim().charAt(0).toUpperCase())
const identityName = computed(() => props.accountLabel || 'admin token')
const server = computed(() => props.serverUrl.replace(/^https?:\/\//, ''))
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

    <!-- Environment: a real select when the server has more than one, a quiet static marker when it
         has only one, so a single-environment server does not look like it hides a menu. -->
    <div v-if="!collapsed" class="env">
      <div class="env-control" :class="{ 'env-control--static': environments.length <= 1 }">
        <span class="env-dot" aria-hidden="true"></span>
        <template v-if="environments.length > 1">
          <select
            class="env-select"
            aria-label="Environment"
            :value="currentEnvironment"
            @change="emit('switchEnvironment', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="env in environments" :key="env" :value="env">{{ env }}</option>
          </select>
          <svg class="env-caret" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 10l5 5 5-5" />
          </svg>
        </template>
        <span v-else class="env-name" :title="`${currentEnvironment} · the only environment on this server`">{{
          currentEnvironment
        }}</span>
      </div>
    </div>

    <nav class="nav-scroll">
      <p v-if="!collapsed" class="nav-group">Workspace</p>
      <button
        v-for="item in workspace"
        :key="item.id"
        class="nav-item"
        :class="{ active: view === item.id }"
        :aria-current="view === item.id ? 'page' : undefined"
        :title="collapsed ? item.label : undefined"
        @click="emit('navigate', item.id)"
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
          <template v-if="item.icon === 'webhook'">
            <path d="M12 2a4 4 0 0 0-3.46 6L3 18h6l3-5.2L15 18h6l-5.54-10A4 4 0 0 0 12 2z" />
          </template>
          <template v-if="item.icon === 'clock'">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
          </template>
        </svg>
        <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
        <span v-if="!collapsed && item.badge && counts.all > 0" class="nav-count mono">{{
          counts.all
        }}</span>
      </button>

      <p v-if="!collapsed" class="nav-group nav-group-2">Team</p>
      <button
        v-for="item in team"
        :key="item.id"
        class="nav-item"
        :class="{ active: view === item.id }"
        :aria-current="view === item.id ? 'page' : undefined"
        :title="collapsed ? item.label : undefined"
        @click="emit('navigate', item.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" class="nav-icon">
          <template v-if="item.icon === 'users'">
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
            <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5" />
          </template>
          <template v-if="item.icon === 'user'">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </template>
          <template v-if="item.icon === 'gear'">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </template>
        </svg>
        <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar-bottom">
      <div class="theme-toggle" role="group" aria-label="Theme">
        <button
          class="theme-btn"
          :class="{ on: theme === 'light' }"
          :aria-pressed="theme === 'light'"
          :title="collapsed ? 'Light theme' : undefined"
          @click="emit('setTheme', 'light')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.4" />
            <path
              d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9"
            />
          </svg>
          <span v-if="!collapsed">Light</span>
        </button>
        <button
          class="theme-btn"
          :class="{ on: theme === 'dark' }"
          :aria-pressed="theme === 'dark'"
          :title="collapsed ? 'Dark theme' : undefined"
          @click="emit('setTheme', 'dark')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" />
          </svg>
          <span v-if="!collapsed">Dark</span>
        </button>
      </div>

      <div class="identity">
        <div class="avatar" aria-hidden="true">{{ avatarInitial }}</div>
        <div v-if="!collapsed" class="identity-text">
          <span class="identity-name" :title="identityName">{{ identityName }}</span>
          <span class="identity-server mono" :title="serverUrl"
            >{{ server }}<template v-if="sessionAge"> · {{ sessionAge }}</template></span
          >
        </div>
        <button
          v-if="!collapsed"
          class="logout-btn"
          aria-label="Log out"
          title="Log out"
          @click="emit('disconnect')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
      <button
        v-if="collapsed"
        class="logout-btn logout-collapsed"
        aria-label="Log out"
        title="Log out"
        @click="emit('disconnect')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 232px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
  z-index: 20;
  transition: width 0.2s ease;
}
.sidebar.collapsed {
  width: 60px;
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 20px;
  flex-shrink: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--text);
  cursor: pointer;
}
.wordmark {
  font-size: 1.06rem;
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
  border-radius: var(--r-xs);
  background: none;
  color: var(--text-mute);
  padding: 0;
  flex-shrink: 0;
}
.collapse-btn:hover {
  color: var(--text);
  background: var(--surface-2);
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

/* ---- environment ---- */
.env {
  padding: 0 12px 16px;
}
.env-control {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--bg);
}
/* One environment: no border/box, so it reads as a label rather than a dead dropdown. */
.env-control--static {
  border-color: transparent;
  padding-left: 4px;
  cursor: default;
}
.env-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--r-pill);
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-wash);
  flex-shrink: 0;
}
.env-name {
  flex: 1;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text);
  text-transform: capitalize;
}
.env-select {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text);
  text-transform: capitalize;
  appearance: none;
  cursor: pointer;
}
.env-select:focus {
  outline: none;
  box-shadow: none;
}
.env-control:focus-within {
  border-color: var(--signal);
  box-shadow: 0 0 0 3px var(--accent-wash);
}
.env-caret {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--text-mute);
  stroke-width: 2;
  stroke-linecap: round;
  pointer-events: none;
  flex-shrink: 0;
}

/* ---- nav ---- */
.nav-scroll {
  flex: 1;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.nav-group {
  font-size: 0.69rem;
  font-weight: 500;
  color: var(--text-mute);
  padding: 6px 12px;
  margin: 0;
  letter-spacing: 0.02em;
}
.nav-group-2 {
  padding-top: 14px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
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
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
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
.nav-count {
  font-size: 0.69rem;
  color: var(--text-mute);
}

/* ---- bottom ---- */
.sidebar-bottom {
  padding: 16px;
  border-top: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex-shrink: 0;
}
.theme-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  padding: 3px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
}
.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border: none;
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--text-mute);
  font-size: 0.8rem;
  font-weight: 500;
  transition:
    color 0.12s,
    background 0.12s;
}
.theme-btn:hover {
  color: var(--text-2);
}
.theme-btn.on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.theme-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--r-pill);
  background: var(--navy);
  color: var(--sail);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
  border: 1px solid var(--line);
}
.identity-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.identity-name {
  font-size: 0.8rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identity-server {
  font-size: 0.68rem;
  color: var(--text-mute);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-mute);
  border-radius: var(--r-xs);
  flex-shrink: 0;
  transition:
    color 0.12s,
    background 0.12s;
}
.logout-btn:hover {
  color: var(--red-text);
  background: var(--red-wash);
}
.logout-btn svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.logout-collapsed {
  align-self: center;
}

/* ---- collapsed ---- */
.collapsed .sidebar-top {
  justify-content: center;
  padding: 0 8px;
}
.collapsed .collapse-btn {
  position: absolute;
  top: 20px;
  right: -12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  z-index: 21;
}
.collapsed .nav-scroll {
  padding: 8px;
}
.collapsed .nav-item {
  justify-content: center;
  padding: 9px;
}
.collapsed .sidebar-bottom {
  padding: 12px 8px;
  align-items: center;
}
.collapsed .theme-toggle {
  grid-template-columns: 1fr;
  width: 100%;
}
.collapsed .identity {
  justify-content: center;
}
</style>
