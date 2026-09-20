<script setup lang="ts">
defineProps<{
  serverUrl: string
  sessionAge: string
  theme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  disconnect: []
  toggleTheme: []
}>()
</script>

<template>
  <div class="settings">
    <h1 class="page-title">Settings</h1>

    <section class="section">
      <h2>Connection</h2>
      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Server</span>
          <code class="mono setting-value">{{ serverUrl }}</code>
        </div>
      </div>
      <div v-if="sessionAge" class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Session duration</span>
          <span class="setting-value">{{ sessionAge }}</span>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Session storage</span>
          <span class="setting-value hint"
            >Token stored in sessionStorage (cleared when tab closes)</span
          >
        </div>
      </div>
      <button class="btn btn-danger btn-sm" @click="emit('disconnect')">Disconnect</button>
    </section>

    <section class="section">
      <h2>Appearance</h2>
      <div class="setting-row clickable" @click="emit('toggleTheme')">
        <div class="setting-info">
          <span class="setting-label">Theme</span>
          <span class="setting-value">{{ theme === 'dark' ? 'Dark' : 'Light' }}</span>
        </div>
        <button class="btn btn-ghost btn-sm" @click.stop="emit('toggleTheme')">
          Switch to {{ theme === 'dark' ? 'light' : 'dark' }}
        </button>
      </div>
    </section>

    <section class="section">
      <h2>Keyboard shortcuts</h2>
      <div class="shortcut-list">
        <div class="shortcut-row">
          <kbd>/</kbd>
          <span>Search flags</span>
        </div>
        <div class="shortcut-row">
          <kbd>n</kbd>
          <span>New flag</span>
        </div>
        <div class="shortcut-row">
          <kbd>g</kbd> <kbd>f</kbd>
          <span>Go to Flags</span>
        </div>
        <div class="shortcut-row">
          <kbd>g</kbd> <kbd>w</kbd>
          <span>Go to Webhooks</span>
        </div>
        <div class="shortcut-row">
          <kbd>g</kbd> <kbd>a</kbd>
          <span>Go to Audit log</span>
        </div>
        <div class="shortcut-row">
          <kbd>g</kbd> <kbd>o</kbd>
          <span>Go to Overview</span>
        </div>
        <div class="shortcut-row">
          <kbd>Esc</kbd>
          <span>Close panel / clear search</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>About</h2>
      <p class="about-text">
        Flaghoist is an open-source feature flag server. Boolean flags only, no experiments.
      </p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  max-width: 600px;
  margin: 0 auto;
  padding: 1.4rem 1.2rem 4rem;
}
.page-title {
  font-size: 1.2rem;
  margin-bottom: 1.5rem;
}

.section {
  margin-bottom: 2rem;
}
.section h2 {
  font-size: 0.84rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-mute);
  margin-bottom: 0.6rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--line-soft);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
}
.setting-row.clickable {
  cursor: pointer;
  border-radius: var(--r-sm);
  padding: 0.5rem 0.4rem;
  margin: 0 -0.4rem;
}
.setting-row.clickable:hover {
  background: var(--surface-2);
}
.setting-info {
  min-width: 0;
}
.setting-label {
  display: block;
  font-size: 0.84rem;
  font-weight: 500;
  color: var(--text);
}
.setting-value {
  font-size: 0.78rem;
  color: var(--text-2);
}
.setting-value.hint {
  font-size: 0.74rem;
  color: var(--text-mute);
}

.shortcut-list {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
}
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.8rem;
  border-bottom: 1px solid var(--line-soft);
  font-size: 0.82rem;
  color: var(--text-2);
}
.shortcut-row:last-child {
  border-bottom: none;
}
.shortcut-row kbd {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-mute);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  background: var(--surface-2);
  min-width: 1.4rem;
  text-align: center;
}

.about-text {
  font-size: 0.84rem;
  color: var(--text-2);
  margin: 0;
}
</style>
