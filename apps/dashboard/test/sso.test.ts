import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminClient, AuthClient, AuthConfig, Me, Member } from '../src/api'
import App from '../src/App.vue'
import MembersPage from '../src/components/MembersPage.vue'
import TokenGate from '../src/components/TokenGate.vue'

const createAdminClient = vi.fn<(opts: { url: string; token: string }) => AdminClient>()
const createAuthClient = vi.fn<(opts: { url: string }) => AuthClient>()
vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api')>()
  return {
    ...actual,
    createAdminClient: (opts: { url: string; token: string }) => createAdminClient(opts),
    createAuthClient: (opts: { url: string }) => createAuthClient(opts),
  }
})

const ssoConfig = (over: Partial<AuthConfig> = {}): AuthConfig => ({
  accounts: true,
  password: { kdf: 'pbkdf2-sha256', iterations: 600000 },
  passwordSignIn: true,
  sso: { label: 'Okta' },
  setupRequired: false,
  ...over,
})

function authClient(over: Partial<AuthClient> = {}): AuthClient {
  return {
    config: vi.fn(async () => ssoConfig()),
    signIn: vi.fn(),
    inspectLink: vi.fn(),
    acceptLink: vi.fn(),
    ssoStartUrl: vi.fn(
      (returnTo: string, hash: string) =>
        `https://x.dev/api/v1/auth/sso/start?return=${encodeURIComponent(returnTo)}&browser=${hash}`,
    ),
    exchangeSso: vi.fn(async () => ({ token: 'fh_sess_sso', expiresAt: '', user: {} as never })),
    ...over,
  }
}

const me: Me = {
  identity: 'ada@acme.com',
  role: 'editor',
  accounts: true,
  passwordSignIn: true,
  user: {
    id: 'usr_1',
    email: 'ada@acme.com',
    name: 'Ada',
    role: 'editor',
    status: 'active',
    hasPassword: false,
    sso: true,
    roleManagedBy: 'sso',
    createdAt: '',
  },
  session: { id: 'ses_1', createdAt: '', expiresAt: '' },
}

function client(over: Partial<AdminClient> = {}): AdminClient {
  return {
    list: vi.fn(async () => []),
    listEnvironments: vi.fn(async () => ({ environments: ['production'], default: 'production' })),
    me: vi.fn(async () => me),
    logout: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => []),
    listTokens: vi.fn(async () => []),
    ...over,
  } as unknown as AdminClient
}

beforeEach(() => {
  sessionStorage.clear()
  createAdminClient.mockReset()
  createAuthClient.mockReset()
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  history.replaceState(null, '', '/')
})

describe('sign-in screen with SSO', () => {
  it('offers the provider by name alongside email and password', async () => {
    createAuthClient.mockReturnValue(authClient())
    const wrapper = mount(TokenGate)
    await flushPromises()
    const button = wrapper.find('.sso-btn')
    expect(button.text()).toBe('Continue with Okta')
    expect(wrapper.find('#gate-email').exists()).toBe(true)
    await button.trigger('click')
    expect(wrapper.emitted('sso')?.[0]?.[0]).toMatch(/^http/)
  })

  it('hides the password form when the server is SSO only', async () => {
    createAuthClient.mockReturnValue(
      authClient({ config: vi.fn(async () => ssoConfig({ passwordSignIn: false })) }),
    )
    const wrapper = mount(TokenGate)
    await flushPromises()
    expect(wrapper.find('.sso-btn').exists()).toBe(true)
    expect(wrapper.find('#gate-email').exists()).toBe(false)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    // The admin token is still reachable.
    expect(wrapper.find('button.switch').text()).toBe('Use an access token')
  })
})

describe('the SSO round trip', () => {
  it('keeps a secret in the tab and sends only its hash out', async () => {
    const auth = authClient()
    createAuthClient.mockReturnValue(auth)
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    await wrapper.find('.sso-btn').trigger('click')
    await flushPromises()
    const attempt = JSON.parse(sessionStorage.getItem('flaghoist.sso')!) as { secret: string }
    const [, hash] = vi.mocked(auth.ssoStartUrl).mock.calls[0]!
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hash).not.toBe(attempt.secret)
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('/api/v1/auth/sso/start'))
    wrapper.unmount()
  })

  it('finishes the sign-in when the provider sends the browser back', async () => {
    sessionStorage.setItem(
      'flaghoist.sso',
      JSON.stringify({ secret: 'tab-secret', url: 'https://x.dev' }),
    )
    history.replaceState(null, '', '/admin/#sso=handback-code')
    const auth = authClient()
    createAuthClient.mockReturnValue(auth)
    createAdminClient.mockReturnValue(client())
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(auth.exchangeSso).toHaveBeenCalledWith('handback-code', 'tab-secret')
    expect(createAdminClient).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x.dev', token: 'fh_sess_sso' }),
    )
    expect(window.location.hash).toBe('')
    expect(sessionStorage.getItem('flaghoist.sso')).toBeNull()
    expect(wrapper.findComponent(TokenGate).exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows what the provider or server refused', async () => {
    history.replaceState(null, '', '/admin/#sso_error=You%20are%20not%20in%20a%20group')
    createAuthClient.mockReturnValue(authClient())
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.findComponent(TokenGate).props('error')).toBe('You are not in a group')
    expect(window.location.hash).toBe('')
    wrapper.unmount()
  })

  it('will not finish a sign-in this tab did not start', async () => {
    history.replaceState(null, '', '/admin/#sso=stolen-code')
    const auth = authClient()
    createAuthClient.mockReturnValue(auth)
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(auth.exchangeSso).not.toHaveBeenCalled()
    expect(wrapper.findComponent(TokenGate).props('error')).toMatch(/another tab/)
    wrapper.unmount()
  })
})

describe('SSO accounts in the dashboard', () => {
  it('shows a group-managed role without a way to change it', async () => {
    const member: Member = { ...me.user!, id: 'usr_2', email: 'b@acme.com' }
    const api = client({
      listMembers: vi.fn(async () => [member]),
      listInvites: vi.fn(async () => []),
    })
    const owner: Me = { ...me, role: 'owner', user: { ...me.user!, role: 'owner' } }
    const wrapper = mount(MembersPage, { props: { api, me: owner, dashboardUrl: 'https://x/' } })
    await flushPromises()
    const row = wrapper.find('.row')
    expect(row.find('select').exists()).toBe(false)
    expect(row.text()).toContain('editor · SSO')
    expect(row.find('button[aria-label="Disable b@acme.com"]').exists()).toBe(true)
  })
})
