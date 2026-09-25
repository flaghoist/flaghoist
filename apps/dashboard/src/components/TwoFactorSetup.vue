<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { renderSVG } from 'uqr'
import { ApiError, type AdminClient, type TwoFactorSetup } from '../api'

const props = defineProps<{ api: AdminClient }>()
const emit = defineEmits<{
  /** Two-factor is on and the person has confirmed they saved their recovery codes. */
  done: []
  failed: [error: unknown]
}>()

const setup = ref<TwoFactorSetup | null>(null)
const code = ref('')
const error = ref('')
const busy = ref(false)
const recoveryCodes = ref<string[] | null>(null)
const copied = ref(false)
const codeEl = ref<HTMLInputElement | null>(null)

// Scanners want dark modules on a light ground, so the code keeps these colours in dark mode too.
const qr = computed(() =>
  setup.value
    ? renderSVG(setup.value.uri, {
        pixelSize: 5,
        border: 2,
        whiteColor: '#fff',
        blackColor: '#000',
      })
    : '',
)
// Four-character groups are easier to type into an app than one long run.
const groupedSecret = computed(() => setup.value?.secret.match(/.{1,4}/g)?.join(' ') ?? '')

async function start() {
  error.value = ''
  busy.value = true
  try {
    setup.value = await props.api.beginTwoFactor()
    await nextTick()
    codeEl.value?.focus()
  } catch (e) {
    emit('failed', e)
  } finally {
    busy.value = false
  }
}

async function confirm() {
  error.value = ''
  busy.value = true
  try {
    recoveryCodes.value = await props.api.confirmTwoFactor(code.value.trim())
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) error.value = e.message
    else emit('failed', e)
  } finally {
    busy.value = false
  }
}

async function copyCodes() {
  if (!recoveryCodes.value) return
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    copied.value = true
  } catch {
    error.value = 'Could not copy. Select the codes and copy them by hand.'
  }
}
</script>

<template>
  <div class="tfa">
    <template v-if="recoveryCodes">
      <p class="lead" role="status">
        Two-factor sign-in is on. Save these recovery codes somewhere safe, such as a password
        manager. Each one signs you in once if you lose your device. They are not shown again.
      </p>
      <ol class="codes mono" aria-label="Recovery codes">
        <li v-for="c in recoveryCodes" :key="c">{{ c }}</li>
      </ol>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" @click="copyCodes">
          {{ copied ? 'Copied' : 'Copy codes' }}
        </button>
        <button class="btn btn-primary btn-sm" @click="emit('done')">I have saved them</button>
      </div>
    </template>

    <template v-else-if="setup">
      <p class="lead">
        Scan this with an authenticator app (1Password, Google Authenticator, Authy and others),
        then enter the six-digit code it shows.
      </p>
      <div
        class="qr"
        role="img"
        aria-label="QR code to scan with your authenticator app"
        v-html="qr"
      ></div>
      <p class="hint">
        Cannot scan? Enter this key in the app instead:
        <code class="mono secret">{{ groupedSecret }}</code>
      </p>
      <form class="confirm" @submit.prevent="confirm">
        <label class="label" for="tfa-code">Code from the app</label>
        <div class="row">
          <input
            id="tfa-code"
            ref="codeEl"
            v-model="code"
            class="mono code-input"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            required
          />
          <button type="submit" class="btn btn-primary btn-sm" :disabled="busy || !code">
            {{ busy ? 'Checking' : 'Turn on' }}
          </button>
        </div>
      </form>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
    </template>

    <template v-else>
      <p class="lead">
        Sign in with a code from an authenticator app as well as your password, so a stolen password
        is not enough on its own.
      </p>
      <button class="btn btn-primary btn-sm" :disabled="busy" @click="start">
        {{ busy ? 'Starting' : 'Set up two-factor sign-in' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.lead {
  margin: 0 0 0.9rem;
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--text-2);
}
.qr {
  display: inline-block;
  padding: 0.5rem;
  background: #fff;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  line-height: 0;
}
.qr :deep(svg) {
  width: 180px;
  height: 180px;
}
.hint {
  margin: 0.8rem 0;
  font-size: 0.8rem;
  color: var(--text-2);
}
.secret {
  display: inline-block;
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: var(--text);
  word-break: break-all;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.code-input {
  width: 8rem;
  letter-spacing: 0.15em;
}
.codes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 12rem));
  gap: 0.35rem 1.5rem;
  margin: 0 0 1rem;
  padding: 0.8rem 1rem 0.8rem 2rem;
  font-size: 0.86rem;
  background: var(--surface-2);
  border-radius: var(--r-md);
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.err {
  margin: 0.8rem 0 0;
  padding: 0.5rem 0.7rem;
  font-size: 0.8rem;
  color: var(--red-text);
  background: var(--red-wash);
  border-radius: var(--r-sm);
}
@media (max-width: 480px) {
  .codes {
    grid-template-columns: 1fr;
  }
}
</style>
