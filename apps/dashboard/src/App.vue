<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ApiError,
  createAdminClient,
  createAuthClient,
  flagEtag,
  isTwoFactorChallenge,
  newBrowserSecret,
  sha256Base64Url,
  type AdminClient,
  type ExportedFlag,
  type ExportPayload,
  type FeatureFlag,
  type FlagInput,
  type ImportResult,
  type Me,
} from './api'
import AcceptLink from './components/AcceptLink.vue'
import AccountPage from './components/AccountPage.vue'
import AuditLog from './components/AuditLog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import FlagEditor from './components/FlagEditor.vue'
import MembersPage from './components/MembersPage.vue'
import Overview from './components/Overview.vue'
import SettingsPage from './components/SettingsPage.vue'
import Sidebar from './components/Sidebar.vue'
import ToastStack, { type Toast } from './components/ToastStack.vue'
import TokenGate from './components/TokenGate.vue'
import TwoFactorSetup from './components/TwoFactorSetup.vue'
import WebhooksPage from './components/WebhooksPage.vue'
import { can } from './roles'

const STORAGE = 'flaghoist.admin'
const THEME = 'flaghoist.theme'
const SIDEBAR = 'flaghoist.sidebar'

type View = 'overview' | 'flags' | 'webhooks' | 'audit' | 'settings' | 'account' | 'members'
type SortKey = 'key' | 'enabled' | 'rollout' | 'updated'
type SortDir = 'asc' | 'desc'
type Filter = 'all' | 'live' | 'paused' | 'targeted'

const api = ref<AdminClient | null>(null)
const serverUrl = ref('')
const serverToken = ref('')
// Who is signed in. Null on a server from before accounts, which has no way to say.
const me = ref<Me | null>(null)
const setupRequired = ref(false)
const isSession = computed(() => serverToken.value.startsWith('fh_sess_'))
const canSeeSecurity = computed(() => me.value !== null && can(me.value.role, 'audit:security'))
// A server from before accounts cannot say who is calling, and every credential there is an owner.
const role = computed(() => (me.value ? me.value.role : 'owner'))
// Flag actions follow the role in the environment being viewed, which can differ from the main one.
const flagRole = computed(
  () => me.value?.environmentRoles?.[currentEnvironment.value] ?? role.value,
)
const canWrite = computed(() => can(flagRole.value, 'flags:write'))
const canDelete = computed(() => can(flagRole.value, 'flags:delete'))
const canImport = computed(() => can(flagRole.value, 'flags:import'))
const canManageWebhooks = computed(() => can(role.value, 'webhooks:manage'))
const canManageMembers = computed(
  () => me.value?.accounts === true && can(role.value, 'members:manage'),
)

// Where invite and reset links send people: this dashboard. When the dashboard is not served by
// the server it manages (a local build, say), the link also names the server.
const dashboardUrl = computed(() => {
  const base = `${window.location.origin}${window.location.pathname}`
  return serverUrl.value && serverUrl.value !== window.location.origin
    ? `${base}?server=${encodeURIComponent(serverUrl.value)}`
    : base
})

/* ---- invite and reset links (#accept=<token>) ------------------------------ */

function readAcceptLink(): { token: string; server: string } | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('accept')
  if (!token) return null
  const server =
    new URLSearchParams(window.location.search).get('server') ??
    (window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:8787')
  return { token, server }
}

const acceptLink = ref(readAcceptLink())

/* ---- SSO (#sso=<code> or #sso_error=<message> on the way back) --------------- */

const SSO_ATTEMPT = 'flaghoist.sso'

/**
 * Send the browser to the server's SSO start. The tab keeps a random secret; only its hash goes
 * out, and the code that comes back is useless without the secret, so a sign-in someone else
 * started cannot be completed in this tab.
 */
async function startSso(url: string) {
  connecting.value = true
  gateError.value = ''
  const secret = newBrowserSecret()
  try {
    sessionStorage.setItem(SSO_ATTEMPT, JSON.stringify({ secret, url }))
  } catch {
    gateError.value = 'This browser blocked session storage, which SSO sign-in needs.'
    connecting.value = false
    return
  }
  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`
  window.location.assign(
    createAuthClient({ url }).ssoStartUrl(returnTo, await sha256Base64Url(secret)),
  )
}

/** Finish an SSO sign-in the provider just sent back. Returns true when there was one to finish. */
function finishSso(): boolean {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const code = params.get('sso')
  const failure = params.get('sso_error')
  if (!code && !failure) return false
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  let attempt: { secret: string; url: string } | null = null
  try {
    attempt = JSON.parse(sessionStorage.getItem(SSO_ATTEMPT) ?? 'null')
    sessionStorage.removeItem(SSO_ATTEMPT)
  } catch {
    attempt = null
  }
  if (failure) {
    gateError.value = failure
    loading.value = false
    return true
  }
  if (!attempt) {
    gateError.value = 'This sign-in started in another tab. Start it again here.'
    loading.value = false
    return true
  }
  const { secret, url } = attempt
  connecting.value = true
  void createAuthClient({ url })
    .exchangeSso(code!, secret)
    .then((result) => connect(url, result.token))
    .catch((e: unknown) => {
      gateError.value = describe(e)
      connecting.value = false
      loading.value = false
    })
  return true
}

function clearAcceptLink() {
  acceptLink.value = null
  // Drop the token from the address bar and history, so it cannot be reused from either.
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

async function onLinkAccepted(url: string, token: string) {
  clearAcceptLink()
  disconnect()
  await connect(url, token)
  if (api.value) toast('You are signed in.', 'ok')
}
const environments = ref<string[]>(['production'])
const defaultEnvironment = ref('production')
const currentEnvironment = ref('production')
const view = ref<View>('overview')
const PAGE_TITLES: Record<View, string> = {
  overview: 'Overview',
  flags: 'Flags',
  webhooks: 'Webhooks',
  audit: 'Audit log',
  settings: 'Settings',
  account: 'Account',
  members: 'Members',
}
const pageTitle = computed(() => PAGE_TITLES[view.value])
const flags = ref<FeatureFlag[]>([])
const loading = ref(true)
const connecting = ref(false)
const gateError = ref('')
const busy = ref<Set<string>>(new Set())

const query = ref('')
const filter = ref<Filter>('all')
const filters: Filter[] = ['all', 'live', 'paused', 'targeted']
const searchEl = ref<HTMLInputElement | null>(null)
const showArchived = ref(false)

const sortKey = ref<SortKey>('updated')
const sortDir = ref<SortDir>('desc')
const selectedKeys = ref<Set<string>>(new Set())

const sidebarCollapsed = ref(false)

function clearFilters() {
  query.value = ''
  filter.value = 'all'
}

const editor = ref<{ flag: FeatureFlag | null } | null>(null)
const editorBusy = ref(false)
const editorError = ref('')

const theme = ref<'light' | 'dark' | null>(null)

/* ---- toasts --------------------------------------------------------------- */

let toastId = 0
const toasts = ref<Toast[]>([])

function toast(text: string, tone: 'ok' | 'error') {
  const id = ++toastId
  toasts.value.push({ id, text, tone })
  setTimeout(() => dismissToast(id), tone === 'error' ? 8000 : 4000)
}

function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

/* ---- sorting -------------------------------------------------------------- */

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'key' ? 'asc' : 'desc'
  }
}

const sorted = computed(() => {
  const arr = [...flags.value]
  const dir = sortDir.value === 'asc' ? 1 : -1
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortKey.value) {
      case 'key':
        cmp = a.key.localeCompare(b.key)
        break
      case 'enabled':
        cmp = Number(a.enabled) - Number(b.enabled)
        break
      case 'rollout':
        cmp = a.rollout.percentage - b.rollout.percentage
        break
      case 'updated':
        cmp = a.metadata.updatedAt.localeCompare(b.metadata.updatedAt)
        break
    }
    if (cmp !== 0) return dir * cmp
    return a.key.localeCompare(b.key)
  })
  return arr
})

const counts = computed(() => ({
  all: flags.value.length,
  live: flags.value.filter((f) => f.enabled && f.rollout.percentage > 0).length,
  paused: flags.value.filter((f) => !f.enabled || f.rollout.percentage === 0).length,
  targeted: flags.value.filter((f) => (f.rules?.length ?? 0) > 0).length,
}))

function matchesActiveView(flag: FeatureFlag): boolean {
  const q = query.value.trim().toLowerCase()
  if (q && !flag.key.toLowerCase().includes(q) && !flag.description?.toLowerCase().includes(q)) {
    return false
  }
  if (filter.value === 'live') return flag.enabled && flag.rollout.percentage > 0
  if (filter.value === 'paused') return !flag.enabled || flag.rollout.percentage === 0
  if (filter.value === 'targeted') return (flag.rules?.length ?? 0) > 0
  return true
}

const visible = computed(() => sorted.value.filter(matchesActiveView))

/* ---- pagination ----------------------------------------------------------- */

const PAGE_SIZE = 20
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(visible.value.length / PAGE_SIZE)))
const paged = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return visible.value.slice(start, start + PAGE_SIZE)
})

watch([query, filter], () => {
  page.value = 1
})

/* ---- selection ------------------------------------------------------------ */

const allPageSelected = computed(
  () => paged.value.length > 0 && paged.value.every((f) => selectedKeys.value.has(f.key)),
)

function toggleSelectAll() {
  if (allPageSelected.value) {
    const pageKeys = new Set(paged.value.map((f) => f.key))
    selectedKeys.value = new Set([...selectedKeys.value].filter((k) => !pageKeys.has(k)))
  } else {
    selectedKeys.value = new Set([...selectedKeys.value, ...paged.value.map((f) => f.key)])
  }
}

function toggleSelect(key: string) {
  const next = new Set(selectedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedKeys.value = next
}

function clearSelection() {
  selectedKeys.value = new Set()
}

/* ---- theme ---------------------------------------------------------------- */

function resolvedTheme(): 'light' | 'dark' {
  if (theme.value) return theme.value
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function toggleTheme() {
  setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark')
}

function setTheme(next: 'light' | 'dark') {
  theme.value = next
  // The design system themes off the `dark` class on <html>.
  document.documentElement.classList.toggle('dark', next === 'dark')
  try {
    localStorage.setItem(THEME, next)
  } catch {
    /* private mode */
  }
}

/* ---- connection ----------------------------------------------------------- */

// A 403 either rejects the credential outright or, with this code, says the credential is fine
// but its role is too low for this one action. Only the first should end the session.
function isRoleRefusal(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.code === 'insufficient_role'
}

function describe(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'session_expired') return 'Your session ended. Sign in again.'
    if (e.code === 'invalid_code' || e.code === 'challenge_expired') return e.message
    if (e.code === 'token_invalid') {
      return 'This access token has expired or was revoked. Sign in again.'
    }
    if (e.status === 401) return 'Unauthorized. Check the admin token.'
    if (isRoleRefusal(e)) return e.message
    if (e.status === 403) return 'Forbidden. This token lacks admin access.'
    if (e.status === 0 || e.status === 408) return e.message
    return e.message || `Server error (${e.status}).`
  }
  return 'Something went wrong.'
}

async function connect(url: string, token: string, persist = true, environment?: string) {
  connecting.value = true
  gateError.value = ''
  const client = createAdminClient({ url, token, environment })
  try {
    try {
      flags.value = await client.list({ includeArchived: showArchived.value })
    } catch (e) {
      // Signed in, but the role needs two-factor set up first: the setup screen takes over below.
      if (!isTwoFactorSetupRefusal(e)) throw e
      flags.value = []
    }
    api.value = client
    serverUrl.value = url
    serverToken.value = token

    // Older servers predate the environments feature and 404 on this endpoint -- fall back to a
    // single unnamed environment so the dashboard behaves exactly as it did before.
    try {
      const envResult = await client.listEnvironments()
      environments.value = envResult.environments
      defaultEnvironment.value = envResult.default
      currentEnvironment.value =
        environment && envResult.environments.includes(environment)
          ? environment
          : envResult.default
    } catch {
      environments.value = ['production']
      defaultEnvironment.value = 'production'
      currentEnvironment.value = 'production'
    }

    await loadIdentity(client, url)
    startSessionClock()
    resetIdleTimer()
    if (persist) {
      sessionStorage.setItem(
        STORAGE,
        JSON.stringify({ url, token, environment: currentEnvironment.value }),
      )
    }
  } catch (e) {
    gateError.value = describe(e)
    api.value = null
  } finally {
    connecting.value = false
    loading.value = false
  }
}

async function loadIdentity(client: AdminClient, url: string) {
  me.value = null
  setupRequired.value = false
  try {
    me.value = await client.me()
  } catch {
    return // A server from before accounts: carry on exactly as before.
  }
  if (me.value.accounts && !me.value.user) {
    try {
      setupRequired.value = (await createAuthClient({ url }).config()).setupRequired === true
    } catch {
      /* the Account page just will not offer setup */
    }
  }
}

// Set when the password was right and a two-factor code is still needed.
const twoFactorStep = ref<{ url: string; challenge: string } | null>(null)

async function signIn(url: string, email: string, password: string) {
  connecting.value = true
  gateError.value = ''
  try {
    const result = await createAuthClient({ url }).signIn(email, password)
    if (isTwoFactorChallenge(result)) {
      twoFactorStep.value = { url, challenge: result.challenge }
      connecting.value = false
      return
    }
    await connect(url, result.token)
  } catch (e) {
    gateError.value =
      e instanceof ApiError && e.status === 401 ? 'Invalid email or password.' : describe(e)
    connecting.value = false
  }
}

async function finishTwoFactor(code: string) {
  const step = twoFactorStep.value
  if (!step) return
  connecting.value = true
  gateError.value = ''
  try {
    const result = await createAuthClient({ url: step.url }).completeTwoFactor(step.challenge, code)
    twoFactorStep.value = null
    await connect(step.url, result.token)
  } catch (e) {
    if (e instanceof ApiError && e.code === 'challenge_expired') twoFactorStep.value = null
    gateError.value = describe(e)
    connecting.value = false
  }
}

function isTwoFactorSetupRefusal(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'two_factor_setup_required'
}

const mustSetUpTwoFactor = computed(() => me.value?.twoFactor?.setupRequired === true)

async function onTwoFactorReady() {
  await connect(serverUrl.value, serverToken.value, false, currentEnvironment.value)
  if (api.value) toast('Two-factor sign-in is on.', 'ok')
}

async function refreshIdentity() {
  if (api.value) await loadIdentity(api.value, serverUrl.value)
}

function onAccountError(e: unknown) {
  const msg = handle(e)
  if (msg) toast(msg, 'error')
}

async function onOwnerCreated(email: string, password: string) {
  const url = serverUrl.value
  disconnect()
  await signIn(url, email, password)
  if (api.value) toast('Owner account created. You are now signed in with it.', 'ok')
}

async function switchEnvironment(environment: string) {
  if (!api.value || environment === currentEnvironment.value) return
  const client = createAdminClient({ url: serverUrl.value, token: serverToken.value, environment })
  try {
    const nextFlags = await client.list({ includeArchived: showArchived.value })
    api.value = client
    currentEnvironment.value = environment
    flags.value = nextFlags
    selectedKeys.value = new Set()
    clearFilters()
    page.value = 1
    sessionStorage.setItem(
      STORAGE,
      JSON.stringify({ url: serverUrl.value, token: serverToken.value, environment }),
    )
    toast(`Switched to ${environment}.`, 'ok')
  } catch (e) {
    const msg = handle(e)
    if (msg) toast(msg, 'error')
  }
}

function disconnect(message = '') {
  // Signing out on purpose ends the session on the server too. When the server already rejected
  // the credential (a message is set) there is nothing left to end.
  if (!message && isSession.value && api.value) void api.value.logout().catch(() => {})
  me.value = null
  setupRequired.value = false
  stopIdleTimer()
  stopSessionClock()
  sessionStorage.removeItem(STORAGE)
  api.value = null
  serverToken.value = ''
  view.value = 'overview'
  flags.value = []
  toasts.value = []
  selectedKeys.value = new Set()
  environments.value = ['production']
  defaultEnvironment.value = 'production'
  currentEnvironment.value = 'production'
  gateError.value = message
}

/* ---- mutations ------------------------------------------------------------ */

function replaceFlag(updated: FeatureFlag) {
  const i = flags.value.findIndex((f) => f.key === updated.key)
  if (i >= 0) flags.value[i] = updated
  else flags.value.push(updated)
}

async function reloadOnConflict(e: unknown) {
  if (e instanceof ApiError && e.status === 412 && api.value) {
    try {
      flags.value = await api.value.list()
    } catch {
      /* a failed reload leaves the stale row; the conflict message still stands */
    }
  }
}

function handle(e: unknown): string {
  if (isTwoFactorSetupRefusal(e)) {
    void refreshIdentity()
    return ''
  }
  if (e instanceof ApiError && (e.status === 401 || e.status === 403) && !isRoleRefusal(e)) {
    disconnect(
      isSession.value
        ? 'Your session ended. Sign in again.'
        : 'Your session ended: the server rejected the admin token. Sign in again.',
    )
    return ''
  }
  return describe(e)
}

async function withBusy(key: string, fn: () => Promise<void>) {
  busy.value = new Set(busy.value).add(key)
  try {
    await fn()
  } catch (e) {
    const msg = handle(e)
    if (msg) toast(msg, 'error')
    await reloadOnConflict(e)
  } finally {
    const next = new Set(busy.value)
    next.delete(key)
    busy.value = next
  }
}

function inputFrom(flag: FeatureFlag, changes: Partial<FlagInput>): FlagInput {
  return {
    enabled: flag.enabled,
    rollout: flag.rollout,
    rules: flag.rules,
    description: flag.description,
    ...changes,
  }
}

function toggle(flag: FeatureFlag) {
  return withBusy(flag.key, async () => {
    const input = inputFrom(flag, { enabled: !flag.enabled })
    replaceFlag(await api.value!.put(flag.key, input, flagEtag(flag)))
  })
}

function setRollout(flag: FeatureFlag, pct: number) {
  return withBusy(flag.key, async () => {
    const input = inputFrom(flag, { rollout: { percentage: pct } })
    replaceFlag(await api.value!.put(flag.key, input, flagEtag(flag)))
  })
}

/* ---- bulk actions --------------------------------------------------------- */

const bulkBusy = ref(false)

async function bulkEnable() {
  bulkBusy.value = true
  let count = 0
  for (const key of selectedKeys.value) {
    const flag = flags.value.find((f) => f.key === key)
    if (!flag || flag.enabled) continue
    try {
      const input = inputFrom(flag, { enabled: true })
      replaceFlag(await api.value!.put(flag.key, input, flagEtag(flag)))
      count++
    } catch (e) {
      toast(`Failed to enable ${key}: ${describe(e)}`, 'error')
    }
  }
  bulkBusy.value = false
  if (count) toast(`Enabled ${count} flag${count > 1 ? 's' : ''}.`, 'ok')
  clearSelection()
}

async function bulkDisable() {
  bulkBusy.value = true
  let count = 0
  for (const key of selectedKeys.value) {
    const flag = flags.value.find((f) => f.key === key)
    if (!flag || !flag.enabled) continue
    try {
      const input = inputFrom(flag, { enabled: false })
      replaceFlag(await api.value!.put(flag.key, input, flagEtag(flag)))
      count++
    } catch (e) {
      toast(`Failed to disable ${key}: ${describe(e)}`, 'error')
    }
  }
  bulkBusy.value = false
  if (count) toast(`Disabled ${count} flag${count > 1 ? 's' : ''}.`, 'ok')
  clearSelection()
}

/* ---- delete --------------------------------------------------------------- */

const pendingDelete = ref<FeatureFlag | null>(null)

function confirmDelete() {
  const flag = pendingDelete.value
  if (!flag) return
  return withBusy(flag.key, async () => {
    await api.value!.delete(flag.key)
    flags.value = flags.value.filter((f) => f.key !== flag.key)
    pendingDelete.value = null
    toast(`Deleted "${flag.key}".`, 'ok')
  })
}

async function saveFromEditor(key: string, input: FlagInput, changeDescription: string) {
  const original = editor.value?.flag
  const creating = original == null
  editorBusy.value = true
  editorError.value = ''
  try {
    const opts = {
      ifMatch: original ? flagEtag(original) : undefined,
      changeDescription: changeDescription || undefined,
    }
    const saved = await api.value!.put(key, input, opts)
    replaceFlag(saved)
    if (creating) {
      const hidden = !matchesActiveView(saved)
      if (hidden) clearFilters()
      toast(
        hidden
          ? `Created "${saved.key}". Filters were cleared so you can see it.`
          : `Created "${saved.key}".`,
        'ok',
      )
    }
    editor.value = null
  } catch (e) {
    const msg = handle(e)
    if (!api.value) editor.value = null
    else editorError.value = msg
    await reloadOnConflict(e)
  } finally {
    editorBusy.value = false
  }
}

/* ---- archive/restore ------------------------------------------------------ */

function archiveFlag(flag: FeatureFlag) {
  return withBusy(flag.key, async () => {
    const archived = await api.value!.archive(flag.key)
    if (showArchived.value) {
      replaceFlag(archived)
    } else {
      flags.value = flags.value.filter((f) => f.key !== flag.key)
    }
    toast(`Archived "${flag.key}".`, 'ok')
  })
}

function restoreFlag(flag: FeatureFlag) {
  return withBusy(flag.key, async () => {
    const restored = await api.value!.restore(flag.key)
    replaceFlag(restored)
    toast(`Restored "${flag.key}".`, 'ok')
  })
}

/* ---- export/import -------------------------------------------------------- */

const importPreview = ref<ExportedFlag[] | null>(null)
const importBusy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function exportFlags() {
  if (!api.value) return
  try {
    const payload = await api.value.exportFlags()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flaghoist-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast(`Exported ${payload.flags.length} flag${payload.flags.length === 1 ? '' : 's'}.`, 'ok')
  } catch (e) {
    const msg = handle(e)
    if (msg) toast(msg, 'error')
  }
}

function openImportPicker() {
  fileInput.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text) as ExportPayload
    if (!Array.isArray(payload?.flags) || payload.flags.length === 0) {
      toast('File contains no flags.', 'error')
      return
    }
    importPreview.value = payload.flags
  } catch {
    toast('Could not read file. Make sure it is valid JSON.', 'error')
  }
}

async function confirmImport() {
  if (!api.value || !importPreview.value) return
  importBusy.value = true
  try {
    const result: ImportResult = await api.value.importFlags({
      version: 1,
      exportedAt: new Date().toISOString(),
      flags: importPreview.value,
    })
    importPreview.value = null
    flags.value = await api.value.list({ includeArchived: showArchived.value })
    const parts: string[] = []
    if (result.created > 0) parts.push(`${result.created} created`)
    if (result.updated > 0) parts.push(`${result.updated} updated`)
    if (result.errors.length > 0) parts.push(`${result.errors.length} failed`)
    toast(`Import complete: ${parts.join(', ')}.`, result.errors.length > 0 ? 'error' : 'ok')
  } catch (e) {
    const msg = handle(e)
    if (msg) toast(msg, 'error')
  } finally {
    importBusy.value = false
  }
}

async function toggleShowArchived() {
  showArchived.value = !showArchived.value
  if (!api.value) return
  try {
    flags.value = await api.value.list({ includeArchived: showArchived.value })
  } catch (e) {
    const msg = handle(e)
    if (msg) toast(msg, 'error')
  }
}

/* ---- session idle timeout ------------------------------------------------- */

const IDLE_MS = 30 * 60 * 1000
const sessionStart = ref<number | null>(null)
const sessionAge = ref('')
const idleRemaining = ref(IDLE_MS)
let idleTimer: ReturnType<typeof setTimeout> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

function startSessionClock() {
  sessionStart.value = Date.now()
  idleRemaining.value = IDLE_MS
  tickTimer = setInterval(() => {
    if (sessionStart.value) sessionAge.value = formatDuration(Date.now() - sessionStart.value)
  }, 60_000)
  sessionAge.value = '0m'
}

function stopSessionClock() {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  sessionStart.value = null
  sessionAge.value = ''
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  if (!api.value) return
  idleTimer = setTimeout(() => {
    disconnect('Session timed out after 30 minutes of inactivity. Sign in again.')
  }, IDLE_MS)
}

function stopIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

const IDLE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const

/* ---- keyboard ------------------------------------------------------------- */

let goPending = false

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)

  if (e.key === 'Escape') {
    if (pendingDelete.value) pendingDelete.value = null
    else if (editor.value) editor.value = null
    else if (query.value) query.value = ''
    else if (typing) (el as HTMLElement).blur()
    return
  }

  if (typing || e.metaKey || e.ctrlKey || e.altKey) return
  if (!api.value) return

  if (goPending) {
    goPending = false
    if (e.key === 'f') {
      e.preventDefault()
      view.value = 'flags'
    } else if (e.key === 'a') {
      e.preventDefault()
      view.value = 'audit'
    } else if (e.key === 'o') {
      e.preventDefault()
      view.value = 'overview'
    } else if (e.key === 'w' && canManageWebhooks.value) {
      e.preventDefault()
      view.value = 'webhooks'
    } else if (e.key === 's') {
      e.preventDefault()
      view.value = 'settings'
    }
    return
  }

  if (e.key === 'g') {
    goPending = true
    setTimeout(() => {
      goPending = false
    }, 600)
    return
  }
  if (e.key === '/') {
    e.preventDefault()
    view.value = 'flags'
    setTimeout(() => searchEl.value?.focus(), 50)
  } else if (e.key === 'n' && canWrite.value) {
    e.preventDefault()
    view.value = 'flags'
    editor.value = { flag: null }
  }
}

/* ---- formatted date helper ------------------------------------------------ */

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/* ---- lifecycle ------------------------------------------------------------ */

onMounted(() => {
  try {
    const t = localStorage.getItem(THEME)
    if (t === 'light' || t === 'dark') theme.value = t
  } catch {
    /* private mode */
  }

  try {
    if (localStorage.getItem(SIDEBAR) === 'collapsed') sidebarCollapsed.value = true
  } catch {
    /* private mode */
  }

  window.addEventListener('keydown', onKey)
  for (const evt of IDLE_EVENTS) window.addEventListener(evt, resetIdleTimer, { passive: true })

  localStorage.removeItem(STORAGE)

  if (finishSso()) return

  const saved = sessionStorage.getItem(STORAGE)
  if (!saved) {
    loading.value = false
    return
  }
  try {
    const { url, token, environment } = JSON.parse(saved) as {
      url: string
      token: string
      environment?: string
    }
    void connect(url, token, false, environment)
  } catch {
    sessionStorage.removeItem(STORAGE)
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  for (const evt of IDLE_EVENTS) window.removeEventListener(evt, resetIdleTimer)
  stopIdleTimer()
  stopSessionClock()
})

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    localStorage.setItem(SIDEBAR, sidebarCollapsed.value ? 'collapsed' : 'expanded')
  } catch {
    /* private mode */
  }
}

function flagState(f: FeatureFlag): { kind: string; label: string } {
  if (!f.enabled) return { kind: 'off', label: 'off' }
  if (f.rollout.percentage === 0) return { kind: 'disabled', label: '0%' }
  if (f.rollout.percentage < 100) return { kind: 'split', label: `${f.rollout.percentage}%` }
  return { kind: 'on', label: 'on' }
}
</script>

<template>
  <AcceptLink
    v-if="!api && acceptLink"
    :server-url="acceptLink.server"
    :token="acceptLink.token"
    @signed-in="onLinkAccepted"
    @cancel="clearAcceptLink"
  />

  <TokenGate
    v-else-if="!api"
    :error="gateError"
    :connecting="connecting"
    :theme="resolvedTheme()"
    @connect="(u, t) => connect(u, t)"
    :two-factor="twoFactorStep !== null"
    @sign-in="(u, e, p) => signIn(u, e, p)"
    @sso="startSso"
    @two-factor-code="finishTwoFactor"
    @cancel-two-factor="twoFactorStep = null"
    @toggle-theme="toggleTheme"
  />

  <div v-else-if="mustSetUpTwoFactor" class="tfa-gate">
    <div class="ck-card ck-card--outline tfa-card">
      <h1 class="tfa-title">Set up two-factor sign-in</h1>
      <p class="tfa-sub">
        Your role needs a code from an authenticator app as well as your password. Set it up to
        continue.
      </p>
      <TwoFactorSetup :api="api" @done="onTwoFactorReady" @failed="onAccountError" />
      <button class="ck-btn ck-btn--ghost ck-btn--sm tfa-out" @click="disconnect()">Log out</button>
    </div>
  </div>

  <div v-else class="shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <Sidebar
      :view="view"
      :collapsed="sidebarCollapsed"
      :server-url="serverUrl"
      :session-age="sessionAge"
      :theme="resolvedTheme()"
      :counts="{ all: counts.all, live: counts.live, paused: counts.paused }"
      :environments="environments"
      :current-environment="currentEnvironment"
      :show-account="me?.accounts === true"
      :show-webhooks="canManageWebhooks"
      :show-members="canManageMembers"
      :account-label="me?.user?.email ?? ''"
      @navigate="
        (v: string) => {
          view = v as View
          selectedKeys = new Set()
        }
      "
      @disconnect="disconnect()"
      @set-theme="setTheme"
      @toggle-collapse="toggleSidebar"
      @switch-environment="switchEnvironment"
    />

    <div class="main-area">
      <!-- Top bar: breadcrumb, global flag search, and the primary action. -->
      <header class="topbar">
        <button class="topbar-menu" aria-label="Toggle menu" @click="toggleSidebar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <nav class="crumbs" aria-label="Breadcrumb">
          <span class="crumb-env">{{ currentEnvironment }}</span>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <span class="crumb-page">{{ pageTitle }}</span>
        </nav>

        <div class="topbar-search">
          <svg viewBox="0 0 24 24" aria-hidden="true" class="topbar-search-icon">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref="searchEl"
            v-model="query"
            type="search"
            placeholder="Search flags"
            aria-label="Search flags"
            @focus="view = 'flags'"
          />
          <kbd v-if="!query" class="kbd">/</kbd>
        </div>

        <button
          v-if="canWrite"
          class="ck-btn ck-btn--solid ck-btn--sm topbar-new"
          @click="editor = { flag: null }"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" class="btn-icon">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New flag
        </button>
      </header>

      <!-- Overview -->
      <Overview
        v-if="view === 'overview'"
        :flags="flags"
        :server-url="serverUrl"
        :token="serverToken"
        @navigate="
          (v: string) => {
            view = v as View
          }
        "
        :read-only="!canWrite"
        @toggle="toggle"
        @new-flag="editor = { flag: null }"
      />

      <!-- Flags -->
      <main v-else-if="view === 'flags'" class="content">
        <div class="page-head">
          <div class="page-head-text">
            <h1 class="page-title">Flags</h1>
            <p class="page-sub">Toggle, roll out and target features without a deploy.</p>
          </div>
          <div class="page-head-actions">
            <button
              class="ck-btn ck-btn--outline ck-btn--sm"
              @click="exportFlags"
              title="Export flags"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="btn-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export
            </button>
            <button
              v-if="canImport"
              class="ck-btn ck-btn--outline ck-btn--sm"
              title="Import flags"
              @click="openImportPicker"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="btn-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Import
            </button>
            <input
              ref="fileInput"
              type="file"
              accept=".json,application/json"
              hidden
              @change="handleImportFile"
            />
          </div>
        </div>

        <p v-if="!canWrite" class="read-only-note" role="note">
          You have view-only access. Ask an admin for the editor role to change flags.
        </p>

        <div class="filter-row">
          <div class="filters" role="group" aria-label="Filter flags">
            <button
              v-for="f in filters"
              :key="f"
              class="chip"
              :class="{ on: filter === f }"
              :aria-pressed="filter === f"
              @click="filter = f"
            >
              {{ f }}<span class="chip-n">{{ counts[f] }}</span>
            </button>
          </div>
          <label class="archive-toggle">
            <input type="checkbox" :checked="showArchived" @change="toggleShowArchived" />
            <span>Show archived</span>
          </label>
        </div>

        <div v-if="loading" class="list" aria-busy="true" aria-label="Loading flags">
          <div v-for="i in 3" :key="i" class="skeleton-row">
            <div class="sk sk-key"></div>
            <div class="sk sk-desc"></div>
            <div class="sk sk-bar"></div>
          </div>
        </div>

        <div v-else-if="flags.length === 0" class="empty-state">
          <svg class="empty-illus" viewBox="0 0 140 110" aria-hidden="true">
            <rect
              x="20"
              y="25"
              width="100"
              height="60"
              rx="8"
              fill="var(--surface-2)"
              stroke="var(--line)"
              stroke-width="1.5"
            />
            <path
              d="M50 45 l5 -12 h30 l5 12"
              fill="none"
              stroke="var(--signal)"
              stroke-width="2"
              stroke-linecap="round"
            />
            <circle
              cx="70"
              cy="55"
              r="10"
              fill="var(--accent-wash)"
              stroke="var(--signal)"
              stroke-width="1.5"
            />
            <path
              d="M67 55 l2 2 4-4"
              fill="none"
              stroke="var(--signal)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <line
              x1="45"
              y1="72"
              x2="95"
              y2="72"
              stroke="var(--line)"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <h2>No flags yet</h2>
          <p>
            Create one here, or from the CLI with <code class="mono">flaghoist flag create</code>.
          </p>
          <button
            v-if="canWrite"
            class="ck-btn ck-btn--solid ck-btn--md"
            @click="editor = { flag: null }"
          >
            Create a flag
          </button>
        </div>

        <div v-else-if="visible.length === 0" class="empty-state">
          <h2>Nothing matches</h2>
          <p>
            No flag matches
            <template v-if="query"
              >"<strong>{{ query }}</strong
              >"</template
            >
            <template v-if="query && filter !== 'all'"> in </template>
            <template v-if="filter !== 'all'"
              ><strong>{{ filter }}</strong></template
            >.
          </p>
          <button class="ck-btn ck-btn--outline ck-btn--md" @click="clearFilters">
            Clear filters
          </button>
        </div>

        <div v-else class="table-wrap">
          <table class="flag-table ck-table ck-table--interactive">
            <thead>
              <tr>
                <th class="col-check">
                  <input
                    type="checkbox"
                    :checked="allPageSelected"
                    :indeterminate="selectedKeys.size > 0 && !allPageSelected"
                    aria-label="Select all flags on this page"
                    @change="toggleSelectAll"
                  />
                </th>
                <th class="col-key sortable" @click="toggleSort('key')">
                  Key
                  <span v-if="sortKey === 'key'" class="sort-arrow">{{
                    sortDir === 'asc' ? '↑' : '↓'
                  }}</span>
                </th>
                <th class="col-status sortable" @click="toggleSort('enabled')">
                  Status
                  <span v-if="sortKey === 'enabled'" class="sort-arrow">{{
                    sortDir === 'asc' ? '↑' : '↓'
                  }}</span>
                </th>
                <th class="col-rollout sortable" @click="toggleSort('rollout')">
                  Rollout
                  <span v-if="sortKey === 'rollout'" class="sort-arrow">{{
                    sortDir === 'asc' ? '↑' : '↓'
                  }}</span>
                </th>
                <th class="col-updated sortable" @click="toggleSort('updated')">
                  Updated
                  <span v-if="sortKey === 'updated'" class="sort-arrow">{{
                    sortDir === 'asc' ? '↑' : '↓'
                  }}</span>
                </th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="flag in paged"
                :key="flag.key"
                class="flag-row"
                :class="{
                  selected: selectedKeys.has(flag.key),
                  off: !flag.enabled,
                  archived: flag.archived,
                }"
              >
                <td class="col-check">
                  <input
                    type="checkbox"
                    :checked="selectedKeys.has(flag.key)"
                    :aria-label="`Select ${flag.key}`"
                    @change="toggleSelect(flag.key)"
                  />
                </td>
                <td class="col-key">
                  <div class="key-cell">
                    <code class="flag-key mono">{{ flag.key }}</code>
                    <span v-if="flag.description" class="flag-desc">{{ flag.description }}</span>
                  </div>
                </td>
                <td class="col-status">
                  <span v-if="flag.archived" class="badge badge-archived">archived</span>
                  <span v-else class="badge" :class="`badge-${flagState(flag).kind}`">{{
                    flagState(flag).label
                  }}</span>
                </td>
                <td class="col-rollout">
                  <div class="rollout-cell">
                    <div class="rollout-bar">
                      <div
                        class="rollout-fill"
                        :style="{ width: `${flag.rollout.percentage}%` }"
                      ></div>
                    </div>
                    <span class="rollout-pct mono">{{ flag.rollout.percentage }}%</span>
                  </div>
                </td>
                <td class="col-updated">
                  <span class="time-cell">{{ formatTime(flag.metadata.updatedAt) }}</span>
                  <span class="actor-cell">{{ flag.metadata.updatedBy }}</span>
                </td>
                <td class="col-actions">
                  <div v-if="flag.archived" class="action-group">
                    <button
                      v-if="canWrite"
                      class="ck-btn ck-btn--ghost ck-btn--sm"
                      :disabled="busy.has(flag.key)"
                      @click="restoreFlag(flag)"
                    >
                      Restore
                    </button>
                    <button
                      v-if="canDelete"
                      class="ck-btn ck-btn--ghost ck-btn--sm danger-hover"
                      @click="pendingDelete = flag"
                    >
                      Delete
                    </button>
                  </div>
                  <div v-else class="action-group">
                    <button
                      class="toggle toggle-sm"
                      :data-on="flag.enabled"
                      :disabled="busy.has(flag.key) || !canWrite"
                      :aria-label="flag.enabled ? `Disable ${flag.key}` : `Enable ${flag.key}`"
                      @click="toggle(flag)"
                    ></button>
                    <button
                      v-if="canWrite"
                      class="row-icon-btn"
                      title="Edit"
                      :aria-label="`Edit ${flag.key}`"
                      @click="editor = { flag }"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      v-if="canWrite"
                      class="row-icon-btn"
                      title="Archive"
                      :aria-label="`Archive ${flag.key}`"
                      @click="archiveFlag(flag)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="2" y="3" width="20" height="5" rx="1" />
                        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                        <path d="M10 12h4" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <nav v-if="totalPages > 1" class="pagination" aria-label="Flag list pages">
          <button
            class="ck-btn ck-btn--outline ck-btn--sm"
            :disabled="page <= 1"
            @click="page = Math.max(1, page - 1)"
          >
            Previous
          </button>
          <span class="page-info mono">{{ page }} / {{ totalPages }}</span>
          <button
            class="ck-btn ck-btn--outline ck-btn--sm"
            :disabled="page >= totalPages"
            @click="page = Math.min(totalPages, page + 1)"
          >
            Next
          </button>
        </nav>

        <!-- Floating bulk action bar, above the bottom edge while rows are selected. -->
        <Transition name="bulk">
          <div
            v-if="selectedKeys.size > 0 && canWrite"
            class="bulk-bar"
            role="region"
            aria-label="Bulk actions"
          >
            <span class="bulk-count mono">{{ selectedKeys.size }} selected</span>
            <button class="bulk-btn" :disabled="bulkBusy" @click="bulkEnable">Enable</button>
            <button class="bulk-btn" :disabled="bulkBusy" @click="bulkDisable">Disable</button>
            <button class="bulk-clear" aria-label="Clear selection" @click="clearSelection">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
        </Transition>

        <ConfirmDialog
          v-if="pendingDelete"
          :title="`Delete ${pendingDelete.key}?`"
          :body="`This removes the flag from storage. Anything reading it falls back to the default your code passes in. This cannot be undone.`"
          :busy="busy.has(pendingDelete.key)"
          @confirm="confirmDelete"
          @cancel="pendingDelete = null"
        />

        <div v-if="importPreview" class="import-overlay" @click.self="importPreview = null">
          <div
            class="import-dialog ck-card ck-card--outline"
            role="dialog"
            aria-labelledby="import-title"
          >
            <h2 id="import-title">
              Import {{ importPreview.length }} flag{{ importPreview.length === 1 ? '' : 's' }}
            </h2>
            <p class="import-hint">
              Existing flags with the same key will be updated. New keys will be created.
            </p>
            <div class="import-list">
              <div v-for="f in importPreview" :key="f.key" class="import-row">
                <code class="mono">{{ f.key }}</code>
                <span class="badge" :class="f.enabled ? 'badge-on' : 'badge-off'">{{
                  f.enabled ? 'on' : 'off'
                }}</span>
                <span class="import-pct mono">{{ f.rollout.percentage }}%</span>
              </div>
            </div>
            <div class="import-actions">
              <button
                class="ck-btn ck-btn--outline ck-btn--sm"
                :disabled="importBusy"
                @click="importPreview = null"
              >
                Cancel
              </button>
              <button
                class="ck-btn ck-btn--solid ck-btn--sm"
                :disabled="importBusy"
                @click="confirmImport"
              >
                {{ importBusy ? 'Importing...' : 'Import' }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="!loading && flags.length > 0" class="hintbar">
          <kbd>/</kbd> search · <kbd>n</kbd> new flag · <kbd>g</kbd><kbd>a</kbd> audit ·
          <kbd>esc</kbd> clear
        </p>
      </main>

      <!-- Audit -->
      <AuditLog
        v-else-if="view === 'audit'"
        :server-url="serverUrl"
        :token="serverToken"
        :environment="currentEnvironment"
        :can-see-security="canSeeSecurity"
        @back="view = 'flags'"
      />

      <!-- Account -->
      <AccountPage
        v-else-if="view === 'account' && api && me"
        :api="api"
        :me="me"
        :setup-required="setupRequired"
        @notify="(text, tone) => toast(text, tone)"
        @failed="onAccountError"
        @owner-created="onOwnerCreated"
        @changed="refreshIdentity"
      />

      <!-- Webhooks -->
      <WebhooksPage
        v-else-if="view === 'webhooks' && api"
        :api="api"
        @toast="(text, tone) => toast(text, tone)"
      />

      <!-- Members -->
      <MembersPage
        v-else-if="view === 'members' && api && me && canManageMembers"
        :api="api"
        :me="me"
        :dashboard-url="dashboardUrl"
        :environments="environments"
        @notify="(text, tone) => toast(text, tone)"
        @failed="onAccountError"
      />

      <!-- Settings -->
      <SettingsPage
        v-else-if="view === 'settings'"
        :server-url="serverUrl"
        :session-age="sessionAge"
        :theme="resolvedTheme()"
        @disconnect="disconnect()"
        @set-theme="setTheme"
      />
    </div>

    <FlagEditor
      v-if="editor"
      :flag="editor.flag"
      :busy="editorBusy"
      :error="editorError"
      :existing-keys="flags.map((f) => f.key)"
      @save="saveFromEditor"
      @cancel="editor = null"
    />

    <ToastStack :toasts="toasts" @dismiss="dismissToast" />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  padding-left: 232px;
  transition: padding-left 0.2s ease;
}
.shell.sidebar-collapsed {
  padding-left: 60px;
}

.main-area {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* ---- top bar ---- */
.topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 64px;
  padding: 0 32px;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.topbar-menu {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--r-xs);
  background: none;
  color: var(--text-2);
  padding: 0;
}
.topbar-menu svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  font-size: 0.81rem;
  color: var(--text-mute);
}
.crumb-env {
  text-transform: capitalize;
}
.crumb-page {
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar-search {
  position: relative;
  width: 280px;
  max-width: 36vw;
  display: flex;
  align-items: center;
}
.topbar-search-icon {
  position: absolute;
  left: 12px;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--text-mute);
  stroke-width: 2;
  stroke-linecap: round;
  pointer-events: none;
}
.topbar-search input {
  width: 100%;
  height: 36px;
  padding: 0 36px;
  font-size: 0.81rem;
  background: var(--surface);
}
.topbar-search input::-webkit-search-cancel-button {
  -webkit-appearance: none;
}
.topbar-search .kbd {
  position: absolute;
  right: 10px;
  pointer-events: none;
  border-bottom-width: 1px;
}
.topbar-new {
  flex-shrink: 0;
}

/* ---- content ---- */
.content {
  flex: 1;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 36px 32px 96px;
}
.page-head {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.page-head-text {
  flex: 1;
  min-width: 200px;
}
.page-sub {
  margin: 4px 0 0;
  color: var(--text-mute);
  font-size: 0.875rem;
}
.page-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vertical-align: -2px;
  margin-right: 0.2rem;
}
.page-title {
  font-size: 1.625rem;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.hintbar kbd {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-mute);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.04rem 0.28rem;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: capitalize;
  color: var(--text-2);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  padding: 0.36rem 0.75rem;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.chip:hover {
  border-color: var(--text-mute);
  color: var(--text);
}
.chip.on {
  color: var(--accent-text);
  border-color: var(--signal);
  background: var(--accent-wash);
}
.chip-n {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  opacity: 0.7;
}
.archive-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.81rem;
  color: var(--text-2);
  cursor: pointer;
  margin-left: auto;
}

/* ---- floating bulk bar ---- */
.bulk-bar {
  position: fixed;
  bottom: 20px;
  left: calc(50% + 116px);
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 6px 6px 16px;
  background: var(--navy);
  color: var(--sail);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-pop);
}
.bulk-count {
  font-size: 0.81rem;
  font-weight: 500;
  margin-right: 10px;
}
.bulk-btn {
  height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: var(--r-xs);
  background: rgba(247, 244, 236, 0.1);
  color: var(--sail);
  font-size: 0.78rem;
  font-weight: 500;
  transition: background 0.12s;
}
.bulk-btn:hover:not(:disabled) {
  background: rgba(247, 244, 236, 0.18);
}
.bulk-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.bulk-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--r-xs);
  background: transparent;
  color: #8b9ab0;
}
.bulk-clear:hover {
  color: var(--sail);
  background: rgba(247, 244, 236, 0.1);
}
.bulk-clear svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
.bulk-enter-active,
.bulk-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.bulk-enter-from,
.bulk-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* ---- data table ---- */
.table-wrap {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
  overflow-x: auto;
}
.flag-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.flag-table th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-mute);
  padding: 0.7rem 0.9rem;
  background: var(--surface-2);
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
  user-select: none;
}
.flag-table th.sortable {
  cursor: pointer;
}
.flag-table th.sortable:hover {
  color: var(--text);
}
.sort-arrow {
  font-size: 0.7rem;
  margin-left: 0.2rem;
}
.flag-table td {
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}
.flag-table tr:last-child td {
  border-bottom: none;
}
.flag-row {
  transition: background 0.1s;
}
.flag-row:hover {
  background: var(--surface-2);
}
.flag-row.selected {
  background: var(--accent-wash);
}
.flag-row.off .col-key,
.flag-row.off .col-rollout {
  opacity: 0.55;
}
.flag-row.archived {
  opacity: 0.6;
}
.flag-row.archived .col-key,
.flag-row.archived .col-rollout {
  opacity: 0.55;
}

.badge {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  white-space: nowrap;
}
.badge-on {
  background: var(--green-wash);
  color: var(--green-text);
}
.badge-off,
.badge-disabled {
  background: var(--surface-2);
  color: var(--text-mute);
}
.badge-split {
  background: var(--accent-wash);
  color: var(--accent-text);
}
.badge-archived {
  background: var(--surface-2);
  color: var(--text-mute);
  border: 1px solid var(--line);
}

.col-check {
  width: 36px;
  text-align: center;
}
.col-check input[type='checkbox'] {
  width: 15px;
  height: 15px;
  accent-color: var(--signal);
  cursor: pointer;
}
.col-key {
  min-width: 160px;
}
.key-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.flag-key {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text);
}
.flag-desc {
  font-size: 0.74rem;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}
.col-status {
  width: 70px;
}
.col-rollout {
  width: 130px;
}
.rollout-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.rollout-bar {
  flex: 1;
  height: 4px;
  background: var(--track);
  border-radius: var(--r-pill);
  overflow: hidden;
}
.rollout-fill {
  height: 100%;
  background: var(--signal);
  border-radius: var(--r-pill);
  transition: width 0.2s ease;
}
.rollout-pct {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-2);
  width: 2.4rem;
  text-align: right;
}
.col-updated {
  width: 140px;
}
.time-cell {
  display: block;
  font-size: 0.74rem;
  color: var(--text-mute);
  white-space: nowrap;
}
.actor-cell {
  font-size: 0.68rem;
  color: var(--text-mute);
}
.col-actions {
  width: 128px;
}
.action-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.row-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--text-mute);
  transition:
    color 0.12s,
    background 0.12s;
}
.row-icon-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}
.row-icon-btn svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tfa-gate {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
}
.tfa-card {
  width: 100%;
  max-width: 460px;
  padding: 1.6rem 1.5rem;
}
.tfa-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
}
.tfa-sub {
  margin: 0 0 1.2rem;
  font-size: 0.84rem;
  color: var(--text-2);
}
.tfa-out {
  margin-top: 1.2rem;
}
.read-only-note {
  margin: 0 0 1rem;
  padding: 0.55rem 0.8rem;
  font-size: 0.8rem;
  color: var(--text-2);
  background: var(--accent-wash);
  border-radius: var(--r-sm);
}
.danger-hover:hover {
  color: var(--red-text);
  background: var(--red-wash);
}

/* ---- empty states ---- */
.empty-state {
  text-align: center;
  padding: 3.5rem 2rem;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
}
.empty-illus {
  width: 140px;
  height: 110px;
  margin-bottom: 1rem;
}
.empty-state h2 {
  font-size: 1.05rem;
}
.empty-state p {
  margin: 0.4rem 0 1.1rem;
  font-size: 0.88rem;
  color: var(--text-2);
}
.empty-state code {
  font-size: 0.85em;
  background: var(--accent-wash);
  padding: 0.08rem 0.32rem;
  border-radius: 4px;
}

.list {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
}
.skeleton-row {
  padding: 0.95rem 1rem;
  border-bottom: 1px solid var(--line-soft);
}
.skeleton-row:last-child {
  border-bottom: 0;
}
.sk {
  height: 9px;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--line-soft) 25%, var(--line) 37%, var(--line-soft) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
.sk-key {
  width: 30%;
}
.sk-desc {
  width: 55%;
  margin-top: 0.55rem;
  height: 7px;
}
.sk-bar {
  width: 100%;
  margin-top: 0.8rem;
  height: 4px;
}
@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  margin: 1rem 0 0;
}
.page-info {
  font-size: 0.78rem;
  color: var(--text-2);
}
.hintbar {
  margin: 1rem 0 0;
  text-align: center;
  font-size: 0.74rem;
  color: var(--text-mute);
}

/* ---- mobile overlay sidebar ---- */
@media (max-width: 768px) {
  .shell {
    padding-left: 0;
  }
  .shell.sidebar-collapsed {
    padding-left: 0;
  }
  .topbar {
    padding: 0 16px;
    gap: 10px;
  }
  .topbar-menu {
    display: flex;
  }
  .crumbs {
    display: none;
  }
  .topbar-search {
    flex: 1;
    width: auto;
    max-width: none;
  }
  .content {
    padding: 24px 16px 96px;
  }
  :deep(.sidebar) {
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    width: 260px;
    box-shadow: var(--shadow-pop);
  }
  .shell:not(.sidebar-collapsed) :deep(.sidebar) {
    transform: translateX(0);
  }
  .shell.sidebar-collapsed :deep(.sidebar) {
    transform: translateX(-100%);
  }
  .bulk-bar {
    left: 50%;
  }
  .col-check,
  .col-rollout,
  .col-updated {
    display: none;
  }
  .flag-table th,
  .flag-table td {
    padding: 0.6rem;
  }
}

/* ---- import dialog ---- */
.import-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: var(--color-black-alpha-500);
}
.import-dialog {
  width: min(32rem, 100%);
  padding: 22px;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}
.import-dialog h2 {
  margin: 0 0 0.3rem;
  font-size: 1rem;
}
.import-hint {
  margin: 0 0 1rem;
  font-size: 0.82rem;
  color: var(--text-2);
  line-height: 1.5;
}
.import-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  margin-bottom: 1rem;
}
.import-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.7rem;
  font-size: 0.82rem;
  border-bottom: 1px solid var(--line-soft);
}
.import-row:last-child {
  border-bottom: none;
}
.import-row code {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.import-pct {
  font-size: 0.74rem;
  color: var(--text-mute);
}
.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
