<script setup lang="ts">
import { onMounted, ref } from 'vue'

defineProps<{ error?: string; connecting?: boolean; theme?: 'light' | 'dark' }>()
const emit = defineEmits<{ connect: [url: string, token: string]; toggleTheme: [] }>()

// Prefill the origin this console is served from, which is the server in every real deployment.
// Falls back to the dev-server default when opened from a file or a bundler.
const url = ref(
  window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:8787',
)
const token = ref('')
const tokenEl = ref<HTMLInputElement | null>(null)

onMounted(() => tokenEl.value?.focus())

function submit() {
  if (url.value && token.value) emit('connect', url.value.trim(), token.value.trim())
}
</script>

<template>
  <div class="gate">
    <button
      class="theme"
      :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
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

    <div class="card gate-card">
      <div class="head">
        <svg width="26" height="26" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="16" cy="9" r="3" fill="currentColor" />
          <rect x="14.25" y="9" width="3.5" height="48" rx="1.75" fill="currentColor" />
          <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="var(--signal)" />
        </svg>
        <h1>Flag<span>hoist</span></h1>
      </div>
      <p class="sub">Sign in to manage this server's flags.</p>

      <form @submit.prevent="submit">
        <label class="label" for="gate-url">Server URL</label>
        <input
          id="gate-url"
          v-model="url"
          class="mono full"
          placeholder="https://flags.example.com"
        />

        <label class="label spaced" for="gate-token">Admin token</label>
        <input
          id="gate-token"
          ref="tokenEl"
          v-model="token"
          type="password"
          class="full"
          placeholder="Bearer token"
          autocomplete="current-password"
        />

        <p v-if="error" class="err" role="alert">{{ error }}</p>

        <button type="submit" class="btn btn-primary full connect" :disabled="connecting || !token">
          {{ connecting ? 'Connecting' : 'Connect' }}
        </button>
      </form>
    </div>

    <p class="fine">The token stays in this browser. It is never sent anywhere but your server.</p>
  </div>
</template>

<style scoped>
.gate {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 1.25rem;
}
.theme {
  position: fixed;
  top: 1rem;
  right: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: none;
  color: var(--text-2);
}
.theme:hover {
  color: var(--text);
  background: var(--accent-wash);
}
.theme svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

.gate-card {
  width: 100%;
  max-width: 350px;
  padding: 1.6rem 1.5rem;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text);
}
.head h1 {
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.head h1 span {
  color: var(--signal);
}
.sub {
  margin: 0.5rem 0 1.3rem;
  font-size: 0.84rem;
  color: var(--text-2);
}
.full {
  width: 100%;
}
.spaced {
  margin-top: 0.85rem;
}
.connect {
  margin-top: 1.2rem;
}
.err {
  margin: 0.9rem 0 0;
  padding: 0.55rem 0.7rem;
  font-size: 0.8rem;
  color: var(--red-text);
  background: var(--red-wash);
  border-radius: var(--r-sm);
}
.fine {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-mute);
  text-align: center;
  max-width: 350px;
}
</style>
