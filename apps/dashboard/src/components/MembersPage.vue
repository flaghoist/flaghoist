<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  ApiError,
  inviteLink,
  type AdminClient,
  type Invite,
  type LinkResult,
  type Me,
  type Member,
} from '../api'
import { assignableRoles } from '../roles'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{
  api: AdminClient
  me: Me
  dashboardUrl: string
  /** Configured environments. With more than one, members can have a role per environment. */
  environments?: string[]
}>()
const emit = defineEmits<{
  notify: [text: string, tone: 'ok' | 'error']
  failed: [error: unknown]
}>()

const members = ref<Member[]>([])
const invites = ref<Invite[]>([])
const loading = ref(true)
const busy = ref<Set<string>>(new Set())

const roles = computed(() => assignableRoles(props.me.role))

async function load() {
  try {
    const [m, i] = await Promise.all([props.api.listMembers(), props.api.listInvites()])
    members.value = m
    invites.value = i
  } catch (e) {
    emit('failed', e)
  } finally {
    loading.value = false
  }
}

/** A refusal the page can explain in place, rather than one that should end the session. */
function inline(e: unknown): string | null {
  if (e instanceof ApiError && (e.status === 409 || e.status === 400)) return e.message
  if (e instanceof ApiError && e.code === 'insufficient_role') return e.message
  return null
}

async function withBusy(id: string, fn: () => Promise<void>) {
  busy.value = new Set(busy.value).add(id)
  try {
    await fn()
  } catch (e) {
    const msg = inline(e)
    if (msg) emit('notify', msg, 'error')
    else emit('failed', e)
  } finally {
    const next = new Set(busy.value)
    next.delete(id)
    busy.value = next
  }
}

/* ---- the one-time link ----------------------------------------------------- */

const shownLink = ref<{ url: string; invite: Invite } | null>(null)
const linkEl = ref<HTMLInputElement | null>(null)
const copied = ref(false)

async function showLink(result: LinkResult) {
  shownLink.value = { url: inviteLink(props.dashboardUrl, result.token), invite: result.invite }
  copied.value = false
  await nextTick()
  linkEl.value?.focus()
  linkEl.value?.select()
}

async function copyLink() {
  if (!shownLink.value) return
  try {
    await navigator.clipboard.writeText(shownLink.value.url)
    copied.value = true
  } catch {
    linkEl.value?.select()
    emit('notify', 'Could not copy. The link is selected: press Ctrl+C or Cmd+C.', 'error')
  }
}

/* ---- invite ---------------------------------------------------------------- */

const inviteEmail = ref('')
const inviteRole = ref('viewer')
const inviteError = ref('')
const inviting = ref(false)

async function invite() {
  inviteError.value = ''
  inviting.value = true
  try {
    const result = await props.api.createInvite({
      email: inviteEmail.value.trim(),
      role: inviteRole.value,
    })
    inviteEmail.value = ''
    invites.value = [result.invite, ...invites.value.filter((i) => i.email !== result.invite.email)]
    await showLink(result)
  } catch (e) {
    const msg = inline(e)
    if (msg) inviteError.value = msg
    else emit('failed', e)
  } finally {
    inviting.value = false
  }
}

function resend(inv: Invite) {
  return withBusy(inv.id, async () => {
    const result = await props.api.resendInvite(inv.id)
    invites.value = invites.value.map((i) => (i.id === inv.id ? result.invite : i))
    await showLink(result)
  })
}

function revoke(inv: Invite) {
  return withBusy(inv.id, async () => {
    await props.api.revokeInvite(inv.id)
    invites.value = invites.value.filter((i) => i.id !== inv.id)
    emit('notify', `Cancelled the invite for ${inv.email}.`, 'ok')
  })
}

/* ---- members --------------------------------------------------------------- */

const isSelf = (m: Member) => m.id === props.me.user?.id
const manageable = (m: Member) => !isSelf(m) && (m.role !== 'owner' || props.me.role === 'owner')

function changeRole(m: Member, role: string) {
  if (role === m.role) return
  return withBusy(m.id, async () => {
    const saved = await props.api.updateMember(m.id, { role })
    members.value = members.value.map((x) => (x.id === m.id ? { ...x, ...saved } : x))
    emit('notify', `${m.email} is now ${saved.role}.`, 'ok')
  }).finally(() => {
    // A refused change leaves the select showing the old role again.
    members.value = [...members.value]
  })
}

function setStatus(m: Member, status: 'active' | 'disabled') {
  return withBusy(m.id, async () => {
    const saved = await props.api.updateMember(m.id, { status })
    members.value = members.value.map((x) => (x.id === m.id ? { ...x, ...saved } : x))
    emit(
      'notify',
      status === 'disabled' ? `${m.email} is disabled and signed out.` : `${m.email} is enabled.`,
      'ok',
    )
  })
}

function resetLink(m: Member) {
  return withBusy(m.id, async () => {
    await showLink(await props.api.createResetLink(m.id))
  })
}

const perEnvironment = computed(() => (props.environments?.length ?? 0) > 1)
// Environment roles go up to admin; an owner already has full access everywhere.
const environmentRoleChoices = computed(() => roles.value.filter((r) => r !== 'owner'))

function setEnvironmentRole(m: Member, environment: string, value: string) {
  return withBusy(m.id, async () => {
    const saved = await props.api.updateMember(m.id, {
      environmentRoles: { ...m.environmentRoles, [environment]: value || null },
    })
    members.value = members.value.map((x) =>
      x.id === m.id ? { ...x, environmentRoles: saved.environmentRoles } : x,
    )
    emit(
      'notify',
      value
        ? `${m.email} is ${value} in ${environment}.`
        : `${m.email} has their main role in ${environment}.`,
      'ok',
    )
  }).finally(() => {
    members.value = [...members.value]
  })
}

const pendingRemove = ref<Member | null>(null)
const pendingTwoFactorReset = ref<Member | null>(null)

function confirmTwoFactorReset() {
  const m = pendingTwoFactorReset.value
  if (!m) return
  return withBusy(m.id, async () => {
    await props.api.resetMemberTwoFactor(m.id)
    members.value = members.value.map((x) => (x.id === m.id ? { ...x, twoFactor: false } : x))
    emit('notify', `Two-factor sign-in is off for ${m.email}, and they are signed out.`, 'ok')
  }).finally(() => {
    pendingTwoFactorReset.value = null
  })
}

function confirmRemove() {
  const m = pendingRemove.value
  if (!m) return
  return withBusy(m.id, async () => {
    await props.api.removeMember(m.id)
    members.value = members.value.filter((x) => x.id !== m.id)
    emit('notify', `Removed ${m.email}.`, 'ok')
  }).finally(() => {
    pendingRemove.value = null
  })
}

function formatTime(iso?: string): string {
  if (!iso) return 'Not signed in'
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

onMounted(() => void load())
</script>

<template>
  <div class="members">
    <h1 class="page-title">Members</h1>

    <section class="section" aria-labelledby="invite-heading">
      <h2 id="invite-heading">Invite someone</h2>
      <form class="invite-form" @submit.prevent="invite">
        <div class="field grow">
          <label class="label" for="invite-email">Email</label>
          <input
            id="invite-email"
            v-model="inviteEmail"
            type="email"
            class="full"
            autocomplete="off"
            required
          />
        </div>
        <div class="field">
          <label class="label" for="invite-role">Role</label>
          <select id="invite-role" v-model="inviteRole">
            <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="inviting">
          {{ inviting ? 'Inviting' : 'Create invite link' }}
        </button>
      </form>
      <p v-if="inviteError" class="err" role="alert">{{ inviteError }}</p>
      <p class="hint">
        Flaghoist does not send email. You get a link to pass on yourself; it works once.
      </p>
    </section>

    <div v-if="shownLink" class="link-panel" role="status">
      <p class="link-title">
        <template v-if="shownLink.invite.kind === 'invite'">
          Invite link for <strong>{{ shownLink.invite.email }}</strong> as
          {{ shownLink.invite.role }}
        </template>
        <template v-else>
          Password reset link for <strong>{{ shownLink.invite.email }}</strong>
        </template>
      </p>
      <div class="link-row">
        <label class="visually-hidden" for="shown-link">Link</label>
        <input id="shown-link" ref="linkEl" class="mono full" :value="shownLink.url" readonly />
        <button class="btn btn-primary btn-sm" @click="copyLink">
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <p class="link-note">
        Anyone with this link can use it until {{ formatTime(shownLink.invite.expiresAt) }}. It is
        shown only now; create a new one if it is lost.
      </p>
      <button class="btn btn-quiet btn-sm" @click="shownLink = null">Done</button>
    </div>

    <section class="section" aria-labelledby="members-heading">
      <h2 id="members-heading">Members</h2>
      <p v-if="loading" class="hint">Loading...</p>
      <p v-else-if="members.length === 0" class="hint">No members yet.</p>
      <ul v-else class="list">
        <li
          v-for="m in members"
          :key="m.id"
          class="row"
          :class="{ disabled: m.status !== 'active' }"
        >
          <div class="who">
            <span class="name">
              {{ m.name || m.email }}
              <span v-if="isSelf(m)" class="tag tag-self">You</span>
              <span v-if="m.status !== 'active'" class="tag tag-off">Disabled</span>
              <span v-if="m.sso" class="tag tag-sso">SSO</span>
              <span v-if="m.twoFactor" class="tag tag-sso">2FA</span>
            </span>
            <span class="meta">
              <template v-if="m.name">{{ m.email }} · </template>last active
              {{ formatTime(m.lastActiveAt) }}
            </span>
          </div>
          <div class="controls">
            <template v-if="manageable(m)">
              <span v-if="m.roleManagedBy === 'sso'" class="role-badge" title="Set by SSO groups"
                >{{ m.role }} · SSO</span
              >
              <label v-if="m.roleManagedBy !== 'sso'" class="visually-hidden" :for="`role-${m.id}`"
                >Role for {{ m.email }}</label
              >
              <select
                v-if="m.roleManagedBy !== 'sso'"
                :id="`role-${m.id}`"
                :value="m.role"
                :disabled="busy.has(m.id)"
                @change="changeRole(m, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
              </select>
              <button
                class="btn btn-quiet btn-sm"
                :disabled="busy.has(m.id)"
                :aria-label="`Create a password reset link for ${m.email}`"
                @click="resetLink(m)"
              >
                Reset password
              </button>
              <button
                v-if="m.twoFactor"
                class="btn btn-quiet btn-sm"
                :disabled="busy.has(m.id)"
                :aria-label="`Turn off two-factor sign-in for ${m.email}`"
                @click="pendingTwoFactorReset = m"
              >
                Reset 2FA
              </button>
              <button
                class="btn btn-quiet btn-sm"
                :disabled="busy.has(m.id)"
                :aria-label="`${m.status === 'active' ? 'Disable' : 'Enable'} ${m.email}`"
                @click="setStatus(m, m.status === 'active' ? 'disabled' : 'active')"
              >
                {{ m.status === 'active' ? 'Disable' : 'Enable' }}
              </button>
              <button
                class="btn btn-quiet btn-sm danger-hover"
                :disabled="busy.has(m.id)"
                :aria-label="`Remove ${m.email}`"
                @click="pendingRemove = m"
              >
                Remove
              </button>
            </template>
            <span v-else class="role-badge">{{ m.role }}</span>
          </div>
          <div
            v-if="perEnvironment && m.role !== 'owner' && (manageable(m) || m.environmentRoles)"
            class="env-roles"
          >
            <template v-if="manageable(m)">
              <span class="env-roles-label" :id="`env-roles-${m.id}`">By environment</span>
              <div
                v-for="env in environments"
                :key="env"
                class="env-role"
                role="group"
                :aria-labelledby="`env-roles-${m.id}`"
              >
                <label class="env-name" :for="`env-${m.id}-${env}`">{{ env }}</label>
                <select
                  :id="`env-${m.id}-${env}`"
                  :value="m.environmentRoles?.[env] ?? ''"
                  :disabled="busy.has(m.id)"
                  @change="setEnvironmentRole(m, env, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Main role ({{ m.role }})</option>
                  <option v-for="r in environmentRoleChoices" :key="r" :value="r">{{ r }}</option>
                </select>
              </div>
            </template>
            <template v-else>
              <span v-for="(r, env) in m.environmentRoles" :key="env" class="tag tag-sso"
                >{{ env }}: {{ r }}</span
              >
            </template>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="invites.length > 0" class="section" aria-labelledby="invites-heading">
      <h2 id="invites-heading">Open invites</h2>
      <ul class="list">
        <li v-for="inv in invites" :key="inv.id" class="row">
          <div class="who">
            <span class="name">{{ inv.email }}</span>
            <span class="meta"
              >{{ inv.role }} · invited by {{ inv.invitedBy }} · expires
              {{ formatTime(inv.expiresAt) }}</span
            >
          </div>
          <div v-if="inv.role !== 'owner' || me.role === 'owner'" class="controls">
            <button
              class="btn btn-quiet btn-sm"
              :disabled="busy.has(inv.id)"
              :aria-label="`Create a new invite link for ${inv.email}`"
              @click="resend(inv)"
            >
              New link
            </button>
            <button
              class="btn btn-quiet btn-sm danger-hover"
              :disabled="busy.has(inv.id)"
              :aria-label="`Cancel the invite for ${inv.email}`"
              @click="revoke(inv)"
            >
              Cancel
            </button>
          </div>
        </li>
      </ul>
    </section>

    <ConfirmDialog
      v-if="pendingRemove"
      :title="`Remove ${pendingRemove.email}?`"
      body="They are signed out and can no longer sign in. Their past changes stay in the audit log. To let them back in, invite them again."
      confirm-label="Remove"
      :busy="busy.has(pendingRemove.id)"
      @confirm="confirmRemove"
      @cancel="pendingRemove = null"
    />
    <ConfirmDialog
      v-if="pendingTwoFactorReset"
      :title="`Turn off two-factor for ${pendingTwoFactorReset.email}?`"
      body="For someone who lost their device and recovery codes. They are signed out everywhere, sign in again with their password alone, and can then set two-factor up again. Check it is really them first."
      confirm-label="Turn off"
      :busy="busy.has(pendingTwoFactorReset.id)"
      @confirm="confirmTwoFactorReset"
      @cancel="pendingTwoFactorReset = null"
    />
  </div>
</template>

<style scoped>
.members {
  max-width: 760px;
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
.invite-form {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
}
.field.grow {
  flex: 1 1 220px;
}
.full {
  width: 100%;
}
.hint {
  margin: 0.6rem 0 0;
  font-size: 0.8rem;
  color: var(--text-2);
}
.err {
  margin: 0.7rem 0 0;
  padding: 0.5rem 0.7rem;
  font-size: 0.8rem;
  color: var(--red-text);
  background: var(--red-wash);
  border-radius: var(--r-sm);
}
.link-panel {
  margin: 0 0 2rem;
  padding: 1rem;
  border: 1px solid var(--signal);
  border-radius: var(--r-md);
  background: var(--accent-wash);
}
.link-title {
  margin: 0 0 0.6rem;
  font-size: 0.86rem;
  color: var(--text);
}
.link-row {
  display: flex;
  gap: 0.5rem;
}
.link-note {
  margin: 0.6rem 0 0.4rem;
  font-size: 0.78rem;
  color: var(--text-2);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--line-soft);
  flex-wrap: wrap;
}
.row:last-child {
  border-bottom: none;
}
.row.disabled .name {
  color: var(--text-2);
}
.who {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.name {
  font-size: 0.86rem;
  color: var(--text);
}
.meta {
  font-size: 0.75rem;
  color: var(--text-mute);
}
.controls {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.controls select {
  text-transform: capitalize;
}
.tag {
  margin-left: 0.35rem;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.08rem 0.4rem;
  border-radius: var(--r-pill);
}
.tag-self {
  color: var(--accent-text);
  background: var(--accent-wash);
}
.tag-sso {
  color: var(--text-2);
  background: var(--surface-2);
}
.tag-off {
  color: var(--red-text);
  background: var(--red-wash);
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
.env-roles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
  flex-basis: 100%;
  padding-top: 0.2rem;
}
.env-roles-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-mute);
}
.env-role {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.env-name {
  font-size: 0.78rem;
  color: var(--text-2);
}
.env-role select {
  font-size: 0.78rem;
  text-transform: capitalize;
}
.danger-hover:hover {
  color: var(--red-text);
  background: var(--red-wash);
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
