<script setup lang="ts">
defineProps<{
  serverUrl: string
  sessionAge: string
  theme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  disconnect: []
  setTheme: [theme: 'light' | 'dark']
}>()

const shortcuts: { label: string; keys: string[] }[] = [
  { label: 'Search flags', keys: ['/'] },
  { label: 'New flag', keys: ['n'] },
  { label: 'Go to overview', keys: ['g', 'o'] },
  { label: 'Go to flags', keys: ['g', 'f'] },
  { label: 'Go to webhooks', keys: ['g', 'w'] },
  { label: 'Go to audit log', keys: ['g', 'a'] },
  { label: 'Close panel or clear search', keys: ['Esc'] },
]
</script>

<template>
  <main class="settings">
    <div class="page-head-text">
      <h1 class="page-title">Settings</h1>
      <p class="page-sub">Connection, appearance and shortcuts for this browser.</p>
    </div>

    <section class="row">
      <div class="row-intro">
        <h2>Connection</h2>
        <p>The server this dashboard manages.</p>
      </div>
      <div class="row-body ck-card ck-card--outline">
        <div class="kv">
          <span class="kv-label">Server</span>
          <code class="mono">{{ serverUrl }}</code>
        </div>
        <div v-if="sessionAge" class="kv">
          <span class="kv-label">Session duration</span>
          <span class="mono">{{ sessionAge }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Session storage</span>
          <span class="kv-hint">Token in sessionStorage, cleared when the tab closes</span>
        </div>
        <div class="kv kv-foot">
          <span class="kv-hint">Signs you out and forgets the token.</span>
          <button class="ck-btn ck-btn--outline ck-btn--sm cp-red" @click="emit('disconnect')">
            Disconnect
          </button>
        </div>
      </div>
    </section>

    <section class="row">
      <div class="row-intro">
        <h2>Appearance</h2>
        <p>Saved in this browser only.</p>
      </div>
      <div class="row-body theme-grid">
        <button
          class="theme-card"
          :class="{ on: theme === 'light' }"
          :aria-pressed="theme === 'light'"
          @click="emit('setTheme', 'light')"
        >
          <span class="theme-prev light" aria-hidden="true">
            <span class="prev-side"></span>
            <span class="prev-main">
              <span class="prev-line w50 ink"></span>
              <span class="prev-line w80 faint"></span>
              <span class="prev-line w30 accent"></span>
            </span>
          </span>
          <span class="theme-name">Light</span>
        </button>
        <button
          class="theme-card"
          :class="{ on: theme === 'dark' }"
          :aria-pressed="theme === 'dark'"
          @click="emit('setTheme', 'dark')"
        >
          <span class="theme-prev dark" aria-hidden="true">
            <span class="prev-side"></span>
            <span class="prev-main">
              <span class="prev-line w50 ink"></span>
              <span class="prev-line w80 faint"></span>
              <span class="prev-line w30 accent"></span>
            </span>
          </span>
          <span class="theme-name">Dark</span>
        </button>
      </div>
    </section>

    <section class="row">
      <div class="row-intro">
        <h2>Keyboard shortcuts</h2>
        <p>Work without leaving the keyboard.</p>
      </div>
      <div class="row-body ck-card ck-card--outline">
        <div v-for="s in shortcuts" :key="s.label" class="kv">
          <span>{{ s.label }}</span>
          <span class="keys">
            <kbd v-for="k in s.keys" :key="k" class="kbd">{{ k }}</kbd>
          </span>
        </div>
      </div>
    </section>

    <section class="row last">
      <div class="row-intro">
        <h2>About</h2>
        <p>Own your flags.</p>
      </div>
      <div class="row-body about ck-card ck-card--outline">
        <svg width="28" height="28" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="16" cy="9" r="3" fill="var(--text)" />
          <rect x="14.25" y="9" width="3.5" height="48" rx="1.75" fill="var(--text)" />
          <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="var(--signal)" />
        </svg>
        <div class="about-text">
          <span class="about-name">Flaghoist dashboard</span>
          <span class="about-sub">Boolean flags, self-hosted. Open source.</span>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.settings {
  flex: 1;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 36px 32px 64px;
}
.page-title {
  font-size: 1.625rem;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.page-sub {
  margin: 4px 0 12px;
  color: var(--text-mute);
  font-size: 0.875rem;
}

.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 28px;
  padding: 28px 0;
  border-bottom: 1px solid var(--line);
}
.row.last {
  border-bottom: none;
}
.row-intro h2 {
  margin: 0 0 4px;
  font-size: 0.94rem;
  font-weight: 600;
}
.row-intro p {
  margin: 0;
  font-size: 0.81rem;
  color: var(--text-mute);
}
.row-body {
  grid-column: span 2;
  min-width: 0;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
}

.kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line-soft);
  font-size: 0.84rem;
  flex-wrap: wrap;
}
.kv:last-child {
  border-bottom: none;
}
.kv-label {
  color: var(--text-2);
}
.kv .mono {
  font-size: 0.81rem;
}
.kv-hint {
  font-size: 0.81rem;
  color: var(--text-mute);
}
.kv-foot {
  background: var(--surface-2);
}
.keys {
  display: flex;
  gap: 4px;
}

/* ---- theme cards ---- */
.theme-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.theme-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  text-align: left;
  transition: border-color 0.12s;
}
.theme-card:hover {
  border-color: var(--text-mute);
}
.theme-card.on {
  border-color: var(--signal);
  box-shadow: 0 0 0 3px var(--accent-wash);
}
.theme-prev {
  display: flex;
  height: 72px;
  border-radius: 7px;
  overflow: hidden;
}
.theme-prev.light {
  background: #f7f4ec;
  border: 1px solid rgba(11, 30, 58, 0.12);
}
.theme-prev.dark {
  background: #071426;
  border: 1px solid rgba(247, 244, 236, 0.12);
}
.prev-side {
  width: 28%;
}
.theme-prev.light .prev-side {
  background: #fffdf8;
  border-right: 1px solid rgba(11, 30, 58, 0.1);
}
.theme-prev.dark .prev-side {
  background: #0c1e35;
  border-right: 1px solid rgba(247, 244, 236, 0.1);
}
.prev-main {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.prev-line {
  height: 6px;
  border-radius: 3px;
}
.prev-line.w50 {
  width: 50%;
}
.prev-line.w80 {
  width: 80%;
  height: 5px;
}
.prev-line.w30 {
  width: 30%;
  height: 5px;
}
.theme-prev.light .ink {
  background: #0b1e3a;
}
.theme-prev.light .faint {
  background: rgba(11, 30, 58, 0.15);
}
.theme-prev.dark .ink {
  background: #f7f4ec;
}
.theme-prev.dark .faint {
  background: rgba(247, 244, 236, 0.18);
}
.accent {
  background: var(--signal);
}
.theme-name {
  font-size: 0.81rem;
  font-weight: 500;
}

/* ---- about ---- */
.about {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
}
.about-text {
  display: flex;
  flex-direction: column;
}
.about-name {
  font-size: 0.84rem;
  font-weight: 600;
}
.about-sub {
  font-size: 0.78rem;
  color: var(--text-mute);
}

@media (max-width: 640px) {
  .settings {
    padding: 24px 16px 64px;
  }
  .row-body {
    grid-column: 1;
  }
}
</style>
