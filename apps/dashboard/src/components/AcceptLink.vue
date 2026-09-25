<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ApiError,
  createAuthClient,
  isTwoFactorChallenge,
  MIN_PASSWORD_LENGTH,
  type LinkInfo,
} from '../api'

const props = defineProps<{ serverUrl: string; token: string; theme?: 'light' | 'dark' }>()
const emit = defineEmits<{ signedIn: [url: string, token: string]; cancel: [] }>()

const info = ref<LinkInfo | null>(null)
const gone = ref('')
const name = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)
const nameEl = ref<HTMLInputElement | null>(null)
const passwordEl = ref<HTMLInputElement | null>(null)

const isReset = computed(() => info.value?.kind === 'reset')

function expires(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

onMounted(async () => {
  try {
    info.value = await createAuthClient({ url: props.serverUrl }).inspectLink(props.token)
    setTimeout(() => (isReset.value ? passwordEl : nameEl).value?.focus(), 0)
  } catch (e) {
    gone.value =
      e instanceof ApiError && e.status !== 0 && e.status !== 408
        ? e.message
        : 'Could not reach the server to check this link.'
  }
})

const challenge = ref<string | null>(null)
const code = ref('')

async function submitCode() {
  if (!challenge.value) return
  error.value = ''
  busy.value = true
  try {
    const result = await createAuthClient({ url: props.serverUrl }).completeTwoFactor(
      challenge.value,
      code.value.trim(),
    )
    emit('signedIn', props.serverUrl, result.token)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Something went wrong.'
  } finally {
    busy.value = false
  }
}

async function submit() {
  error.value = ''
  if (password.value.length < MIN_PASSWORD_LENGTH) {
    error.value = `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words work well.`
    return
  }
  if (password.value !== confirm.value) {
    error.value = 'The passwords do not match.'
    return
  }
  busy.value = true
  try {
    const result = await createAuthClient({ url: props.serverUrl }).acceptLink(props.token, {
      name: name.value.trim() || undefined,
      password: password.value,
    })
    // A reset keeps two-factor on: the new password is set, and a code finishes the sign-in.
    if (isTwoFactorChallenge(result)) challenge.value = result.challenge
    else emit('signedIn', props.serverUrl, result.token)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Something went wrong.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="gate">
    <div class="card gate-card">
      <div class="head">
        <svg width="26" height="26" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="16" cy="9" r="3" fill="currentColor" />
          <rect x="14.25" y="9" width="3.5" height="48" rx="1.75" fill="currentColor" />
          <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="var(--signal)" />
        </svg>
        <h1>Flag<span>hoist</span></h1>
      </div>

      <template v-if="gone">
        <p class="err" role="alert">{{ gone }}</p>
        <button class="btn btn-ghost full spaced" @click="emit('cancel')">Go to sign in</button>
      </template>

      <p v-else-if="!info" class="sub" role="status">Checking your link...</p>

      <form v-else-if="challenge" @submit.prevent="submitCode">
        <p class="sub" role="status">
          Your new password is set. Enter a code from your authenticator app, or a recovery code, to
          sign in.
        </p>
        <label class="label" for="accept-code">Two-factor code</label>
        <input
          id="accept-code"
          v-model="code"
          class="mono full"
          autocomplete="one-time-code"
          required
        />
        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-primary full connect" :disabled="busy || !code">
          {{ busy ? 'Checking' : 'Sign in' }}
        </button>
      </form>

      <form v-else @submit.prevent="submit">
        <p class="sub">
          <template v-if="isReset">Set a new password for</template>
          <template v-else
            >You are invited to join as <strong>{{ info.role }}</strong
            >. Set a password for</template
          >
          <strong class="email">{{ info.email }}</strong>
        </p>

        <input
          type="email"
          class="visually-hidden"
          :value="info.email"
          autocomplete="username"
          tabindex="-1"
          aria-hidden="true"
          readonly
        />
        <template v-if="!isReset">
          <label class="label" for="accept-name">Your name</label>
          <input id="accept-name" ref="nameEl" v-model="name" class="full" autocomplete="name" />
        </template>
        <label class="label" :class="{ spaced: !isReset }" for="accept-password">Password</label>
        <input
          id="accept-password"
          ref="passwordEl"
          v-model="password"
          type="password"
          class="full"
          autocomplete="new-password"
          :minlength="MIN_PASSWORD_LENGTH"
          aria-describedby="accept-password-hint"
          required
        />
        <p id="accept-password-hint" class="field-hint">
          At least {{ MIN_PASSWORD_LENGTH }} characters.
        </p>
        <label class="label spaced" for="accept-confirm">Confirm password</label>
        <input
          id="accept-confirm"
          v-model="confirm"
          type="password"
          class="full"
          autocomplete="new-password"
          required
        />
        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-primary full connect" :disabled="busy">
          <template v-if="busy">Saving</template>
          <template v-else>{{
            isReset ? 'Set password and sign in' : 'Join and sign in'
          }}</template>
        </button>
        <p class="fine-in">This link works until {{ expires(info.expiresAt) }}.</p>
      </form>
    </div>
    <p class="fine">Your password is hashed in this browser and never sent to the server.</p>
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
.gate-card {
  width: 100%;
  max-width: 380px;
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
  line-height: 1.5;
  color: var(--text-2);
}
.email {
  display: block;
  color: var(--text);
  word-break: break-all;
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
.field-hint {
  margin: 0.3rem 0 0;
  font-size: 0.75rem;
  color: var(--text-mute);
}
.err {
  margin: 0.9rem 0 0;
  padding: 0.55rem 0.7rem;
  font-size: 0.8rem;
  color: var(--red-text);
  background: var(--red-wash);
  border-radius: var(--r-sm);
}
.fine-in {
  margin: 0.8rem 0 0;
  font-size: 0.75rem;
  color: var(--text-mute);
  text-align: center;
}
.fine {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-mute);
  text-align: center;
  max-width: 380px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
