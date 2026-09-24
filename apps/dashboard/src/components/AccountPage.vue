<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ApiError,
  MIN_PASSWORD_LENGTH,
  type AccountSession,
  type AdminClient,
  type Me,
} from '../api'

const props = defineProps<{ api: AdminClient; me: Me; setupRequired: boolean }>()
const emit = defineEmits<{
  notify: [text: string, tone: 'ok' | 'error']
  failed: [error: unknown]
  ownerCreated: [email: string, password: string]
}>()

const user = computed(() => props.me.user)

/* ---- first owner -------------------------------------------------------- */

const owner = ref({ name: '', email: '', password: '', confirm: '' })
const ownerBusy = ref(false)
const ownerError = ref('')

function passwordProblem(password: string, confirm: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words work well.`
  }
  if (password !== confirm) return 'The passwords do not match.'
  return ''
}

async function createOwner() {
  ownerError.value = passwordProblem(owner.value.password, owner.value.confirm)
  if (ownerError.value) return
  ownerBusy.value = true
  try {
    await props.api.createOwner({
      email: owner.value.email.trim(),
      name: owner.value.name.trim() || undefined,
      password: owner.value.password,
    })
    emit('ownerCreated', owner.value.email.trim(), owner.value.password)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 409))
      ownerError.value = e.message
    else emit('failed', e)
  } finally {
    ownerBusy.value = false
  }
}

/* ---- password ------------------------------------------------------------- */

const pw = ref({ current: '', next: '', confirm: '' })
const pwBusy = ref(false)
const pwError = ref('')

async function changePassword() {
  if (!user.value) return
  pwError.value = passwordProblem(pw.value.next, pw.value.confirm)
  if (pwError.value) return
  pwBusy.value = true
  try {
    const { revokedSessions } = await props.api.changePassword({
      email: user.value.email,
      currentPassword: pw.value.current,
      newPassword: pw.value.next,
    })
    pw.value = { current: '', next: '', confirm: '' }
    emit(
      'notify',
      revokedSessions > 0
        ? `Password changed. Signed out ${revokedSessions} other session${revokedSessions === 1 ? '' : 's'}.`
        : 'Password changed.',
      'ok',
    )
    await loadSessions()
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 429)) pwError.value = e.message
    else emit('failed', e)
  } finally {
    pwBusy.value = false
  }
}

/* ---- sessions ------------------------------------------------------------- */

const sessions = ref<AccountSession[]>([])
const sessionsLoading = ref(false)

async function loadSessions() {
  if (!user.value) return
  sessionsLoading.value = true
  try {
    sessions.value = await props.api.listSessions()
  } catch (e) {
    emit('failed', e)
  } finally {
    sessionsLoading.value = false
  }
}

async function revoke(session: AccountSession) {
  try {
    await props.api.revokeSession(session.id)
    sessions.value = sessions.value.filter((s) => s.id !== session.id)
    emit('notify', 'Session signed out.', 'ok')
  } catch (e) {
    emit('failed', e)
  }
}

async function revokeOthers() {
  try {
    const { revoked } = await props.api.revokeOtherSessions()
    sessions.value = sessions.value.filter((s) => s.current)
    emit('notify', `Signed out ${revoked} other session${revoked === 1 ? '' : 's'}.`, 'ok')
  } catch (e) {
    emit('failed', e)
  }
}

const hasOthers = computed(() => sessions.value.some((s) => !s.current))

function formatTime(iso: string): string {
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

/** A short device description from a user agent, good enough to tell sessions apart. */
function device(ua?: string): string {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /node|undici/i.test(ua)
            ? 'Command line'
            : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} on ${os}` : browser
}

onMounted(() => void loadSessions())
</script>

<template>
  <div class="account">
    <h1 class="page-title">Account</h1>

    <section class="section">
      <h2>Profile</h2>
      <template v-if="user">
        <div class="setting-row">
          <span class="setting-label">Name</span>
          <span class="setting-value">{{ user.name || 'Not set' }}</span>
        </div>
        <div class="setting-row">
          <span class="setting-label">Email</span>
          <span class="setting-value">{{ user.email }}</span>
        </div>
        <div class="setting-row">
          <span class="setting-label">Role</span>
          <span class="role-badge">{{ user.role }}</span>
        </div>
      </template>
      <p v-else class="hint">
        You are signed in with an access token as <strong>{{ me.identity }}</strong
        >, not with an account.
        <template v-if="me.accounts && !setupRequired">
          Sign out and sign in with your email to manage your account.</template
        >
      </p>
    </section>

    <section v-if="!user && setupRequired" class="section">
      <h2>Create the owner account</h2>
      <p class="hint">
        This server has accounts turned on but none exist yet. Create the first one here; it gets
        the Owner role. Keep the admin token somewhere safe afterwards, as a way back in.
      </p>
      <form class="form" @submit.prevent="createOwner">
        <label class="label" for="owner-name">Name</label>
        <input id="owner-name" v-model="owner.name" class="full" autocomplete="name" />
        <label class="label" for="owner-email">Email</label>
        <input
          id="owner-email"
          v-model="owner.email"
          type="email"
          class="full"
          autocomplete="username"
          required
        />
        <label class="label" for="owner-password">Password</label>
        <input
          id="owner-password"
          v-model="owner.password"
          type="password"
          class="full"
          autocomplete="new-password"
          :minlength="MIN_PASSWORD_LENGTH"
          aria-describedby="owner-password-hint"
          required
        />
        <p id="owner-password-hint" class="field-hint">
          At least {{ MIN_PASSWORD_LENGTH }} characters.
        </p>
        <label class="label" for="owner-confirm">Confirm password</label>
        <input
          id="owner-confirm"
          v-model="owner.confirm"
          type="password"
          class="full"
          autocomplete="new-password"
          required
        />
        <p v-if="ownerError" class="err" role="alert">{{ ownerError }}</p>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="ownerBusy">
          {{ ownerBusy ? 'Creating' : 'Create owner account' }}
        </button>
      </form>
    </section>

    <section v-if="user" class="section">
      <h2>Password</h2>
      <form class="form" @submit.prevent="changePassword">
        <input
          type="email"
          class="visually-hidden"
          :value="user.email"
          autocomplete="username"
          tabindex="-1"
          aria-hidden="true"
          readonly
        />
        <label class="label" for="pw-current">Current password</label>
        <input
          id="pw-current"
          v-model="pw.current"
          type="password"
          class="full"
          autocomplete="current-password"
          required
        />
        <label class="label" for="pw-next">New password</label>
        <input
          id="pw-next"
          v-model="pw.next"
          type="password"
          class="full"
          autocomplete="new-password"
          :minlength="MIN_PASSWORD_LENGTH"
          aria-describedby="pw-next-hint"
          required
        />
        <p id="pw-next-hint" class="field-hint">
          At least {{ MIN_PASSWORD_LENGTH }} characters. Changing it signs out your other sessions.
        </p>
        <label class="label" for="pw-confirm">Confirm new password</label>
        <input
          id="pw-confirm"
          v-model="pw.confirm"
          type="password"
          class="full"
          autocomplete="new-password"
          required
        />
        <p v-if="pwError" class="err" role="alert">{{ pwError }}</p>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="pwBusy">
          {{ pwBusy ? 'Saving' : 'Change password' }}
        </button>
      </form>
    </section>

    <section v-if="user" class="section">
      <div class="section-head">
        <h2>Sessions</h2>
        <button v-if="hasOthers" class="btn btn-ghost btn-sm" @click="revokeOthers">
          Sign out other sessions
        </button>
      </div>
      <p v-if="sessionsLoading && sessions.length === 0" class="hint">Loading...</p>
      <ul v-else class="session-list">
        <li v-for="s in sessions" :key="s.id" class="session-row">
          <div class="session-info">
            <span class="session-device">
              {{ device(s.userAgent) }}
              <span v-if="s.current" class="current-badge">This session</span>
            </span>
            <span class="session-meta">
              Signed in {{ formatTime(s.createdAt) }} · last active {{ formatTime(s.lastSeenAt) }}
            </span>
          </div>
          <button
            v-if="!s.current"
            class="btn btn-ghost btn-sm"
            :aria-label="`Sign out ${device(s.userAgent)}, signed in ${formatTime(s.createdAt)}`"
            @click="revoke(s)"
          >
            Sign out
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.account {
  max-width: 640px;
  margin: 0 auto;
  padding: 1.4rem 1.2rem 4rem;
}
.page-title {
  font-size: 1.15rem;
  font-weight: 600;
  margin-bottom: 1.4rem;
}
.section {
  margin-bottom: 2rem;
}
.section h2 {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-2);
  margin-bottom: 0.75rem;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.section-head h2 {
  margin-bottom: 0;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 0.85rem;
}
.setting-label {
  color: var(--text-2);
}
.setting-value {
  color: var(--text);
}
.role-badge {
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: capitalize;
  padding: 0.12rem 0.5rem;
  border-radius: var(--r-pill);
  color: var(--accent-text);
  background: var(--accent-wash);
}
.hint {
  font-size: 0.84rem;
  color: var(--text-2);
  line-height: 1.5;
  margin-bottom: 0.9rem;
}
.form {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 360px;
}
.form .label {
  margin-top: 0.75rem;
}
.form .label:first-of-type {
  margin-top: 0;
}
.form button {
  margin-top: 1rem;
}
.full {
  width: 100%;
}
.field-hint {
  margin: 0.3rem 0 0;
  font-size: 0.75rem;
  color: var(--text-mute);
}
.err {
  margin: 0.8rem 0 0;
  padding: 0.5rem 0.7rem;
  font-size: 0.8rem;
  color: var(--red-text);
  background: var(--red-wash);
  border-radius: var(--r-sm);
  width: 100%;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.session-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--line-soft);
}
.session-row:last-child {
  border-bottom: none;
}
.session-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.session-device {
  font-size: 0.85rem;
  color: var(--text);
}
.session-meta {
  font-size: 0.75rem;
  color: var(--text-mute);
}
.current-badge {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.08rem 0.4rem;
  border-radius: var(--r-pill);
  color: var(--green-text);
  background: var(--green-wash);
}
</style>
