<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { createAuthClient, type AuthConfig } from '../api'

defineProps<{ error?: string; connecting?: boolean; theme?: 'light' | 'dark' }>()
const emit = defineEmits<{
  connect: [url: string, token: string]
  signIn: [url: string, email: string, password: string]
  toggleTheme: []
}>()

// Served by the server itself, the server URL is almost always this origin, so it moves out of
// the way under Advanced. Opened from a file or a bundler, it stays up front.
const servedByServer =
  window.location.protocol.startsWith('http') && window.location.pathname.startsWith('/admin')
const url = ref(
  window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:8787',
)
const token = ref('')
const email = ref('')
const password = ref('')
const config = ref<AuthConfig | null>(null)
// 'password' only once the server has said it has accounts; every other server keeps the token form.
const mode = ref<'password' | 'token'>('token')
const firstField = ref<HTMLInputElement | null>(null)

const insecureUrl = computed(() => {
  try {
    const parsed = new URL(url.value.trim())
    if (parsed.protocol !== 'http:') return false
    const host = parsed.hostname
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1'
  } catch {
    return false
  }
})

const weakToken = ref(false)
watch(token, (v) => {
  weakToken.value = v.length > 0 && v.length < 16
})

let probe = 0
async function discover() {
  const current = ++probe
  const target = url.value.trim()
  if (!target) return
  let result: AuthConfig
  try {
    result = await createAuthClient({ url: target, timeoutMs: 5000 }).config()
  } catch {
    result = { accounts: false }
  }
  if (current !== probe) return
  config.value = result
  mode.value = result.accounts && !result.setupRequired ? 'password' : 'token'
  setTimeout(() => firstField.value?.focus(), 0)
}

let urlTimer: ReturnType<typeof setTimeout> | null = null
watch(url, () => {
  if (urlTimer) clearTimeout(urlTimer)
  urlTimer = setTimeout(() => void discover(), 400)
})

onMounted(() => {
  firstField.value?.focus()
  void discover()
})

function useToken(on: boolean) {
  mode.value = on ? 'token' : 'password'
  setTimeout(() => firstField.value?.focus(), 0)
}

function submit() {
  const target = url.value.trim()
  if (!target) return
  if (mode.value === 'password') {
    if (email.value && password.value) emit('signIn', target, email.value.trim(), password.value)
  } else if (token.value) {
    emit('connect', target, token.value.trim())
  }
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
        <template v-if="!servedByServer">
          <label class="label" for="gate-url">Server URL</label>
          <input
            id="gate-url"
            v-model="url"
            class="mono full"
            placeholder="https://flags.example.com"
          />
        </template>

        <p v-if="insecureUrl" class="warn" role="status">
          Plain HTTP sends your credentials in the clear. Use HTTPS in production.
        </p>

        <template v-if="mode === 'password'">
          <label class="label" :class="{ spaced: !servedByServer }" for="gate-email">Email</label>
          <input
            id="gate-email"
            ref="firstField"
            v-model="email"
            type="email"
            class="full"
            autocomplete="username"
            required
          />
          <label class="label spaced" for="gate-password">Password</label>
          <input
            id="gate-password"
            v-model="password"
            type="password"
            class="full"
            autocomplete="current-password"
            required
          />
        </template>

        <template v-else>
          <p v-if="config?.setupRequired" class="note" role="status">
            No accounts exist yet. Sign in with the admin token, then create the owner account from
            the Account page.
          </p>
          <label class="label" :class="{ spaced: !servedByServer }" for="gate-token">{{
            config?.accounts ? 'Access token' : 'Admin token'
          }}</label>
          <input
            id="gate-token"
            ref="firstField"
            v-model="token"
            type="password"
            class="full"
            placeholder="Bearer token"
            autocomplete="off"
          />
          <p v-if="weakToken" class="warn" role="status">
            Short tokens are guessable. Use at least 16 characters (e.g.
            <code class="mono">openssl rand -hex 32</code>).
          </p>
        </template>

        <p v-if="error" class="err" role="alert">{{ error }}</p>

        <button
          type="submit"
          class="btn btn-primary full connect"
          :disabled="connecting || (mode === 'password' ? !email || !password : !token)"
        >
          <template v-if="mode === 'password'">{{
            connecting ? 'Signing in' : 'Sign in'
          }}</template>
          <template v-else>{{ connecting ? 'Connecting' : 'Connect' }}</template>
        </button>

        <button
          v-if="config?.accounts && !config.setupRequired"
          type="button"
          class="btn btn-quiet full switch"
          @click="useToken(mode === 'password')"
        >
          {{ mode === 'password' ? 'Use an access token' : 'Sign in with email' }}
        </button>

        <details v-if="servedByServer" class="advanced">
          <summary>Advanced</summary>
          <label class="label" for="gate-url">Server URL</label>
          <input
            id="gate-url"
            v-model="url"
            class="mono full"
            placeholder="https://flags.example.com"
          />
        </details>
      </form>
    </div>

    <p class="fine">
      <template v-if="mode === 'password'"
        >Your password is hashed in this browser and never sent to the server.</template
      >
      <template v-else
        >The token stays in this browser. It is never sent anywhere but your server.</template
      >
    </p>
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
.switch {
  margin-top: 0.5rem;
}
.note {
  margin: 0 0 0.85rem;
  padding: 0.5rem 0.7rem;
  font-size: 0.78rem;
  color: var(--text-2);
  background: var(--accent-wash);
  border-radius: var(--r-sm);
}
.advanced {
  margin-top: 1rem;
  font-size: 0.8rem;
  color: var(--text-2);
}
.advanced summary {
  cursor: pointer;
  margin-bottom: 0.6rem;
}
.warn {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.7rem;
  font-size: 0.78rem;
  color: var(--yellow-text);
  background: var(--yellow-wash);
  border-radius: var(--r-sm);
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
