import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminClient, AuthClient, FeatureFlag, Me, Member } from '../src/api'
import App from '../src/App.vue'
import MembersPage from '../src/components/MembersPage.vue'

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

const flag: FeatureFlag = {
  key: 'checkout',
  enabled: true,
  rollout: { percentage: 100 },
  description: '',
  metadata: { createdBy: 'a', createdAt: '', updatedBy: 'a', updatedAt: '2026-09-25T00:00:00Z' },
}

const viewerWithStaging: Me = {
  identity: 'v@example.com',
  role: 'viewer',
  accounts: true,
  passwordSignIn: true,
  user: {
    id: 'usr_v',
    email: 'v@example.com',
    name: 'V',
    role: 'viewer',
    status: 'active',
    hasPassword: true,
    environmentRoles: { staging: 'editor' },
    createdAt: '',
  },
  session: { id: 'ses_1', createdAt: '', expiresAt: '' },
  environmentRoles: { production: 'viewer', staging: 'editor' },
  twoFactor: { enabled: false, required: false, setupRequired: false },
}

function client(over: Partial<AdminClient> = {}): AdminClient {
  return {
    list: vi.fn(async () => [flag]),
    listEnvironments: vi.fn(async () => ({
      environments: ['production', 'staging'],
      default: 'production',
    })),
    me: vi.fn(async () => viewerWithStaging),
    logout: vi.fn(async () => undefined),
    ...over,
  } as unknown as AdminClient
}

beforeEach(() => {
  sessionStorage.clear()
  createAdminClient.mockReset()
  createAuthClient.mockReset()
  createAuthClient.mockReturnValue({ config: vi.fn(async () => ({ accounts: true })) } as never)
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('the dashboard follows the role in the current environment', () => {
  it('is read-only in production and editable in staging for the same person', async () => {
    createAdminClient.mockReturnValue(client())
    sessionStorage.setItem(
      'flaghoist.admin',
      JSON.stringify({ url: 'https://x.dev', token: 'fh_sess_abc' }),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    const sidebar = wrapper.findComponent({ name: 'Sidebar' })
    sidebar.vm.$emit('navigate', 'flags')
    await flushPromises()
    expect(wrapper.find('.read-only-note').exists()).toBe(true)
    expect(wrapper.find('.flag-row .toggle').attributes('disabled')).toBeDefined()

    sidebar.vm.$emit('switchEnvironment', 'staging')
    await flushPromises()
    expect(wrapper.find('.read-only-note').exists()).toBe(false)
    expect(wrapper.find('.flag-row .toggle').attributes('disabled')).toBeUndefined()
    // Members and Webhooks still follow the main role, which is viewer.
    const nav = wrapper.findAll('.nav-item').map((b) => b.text())
    expect(nav).not.toContain('Members')
    wrapper.unmount()
  })
})

describe('setting roles per environment', () => {
  const member: Member = {
    id: 'usr_2',
    email: 'b@example.com',
    name: '',
    role: 'viewer',
    status: 'active',
    hasPassword: true,
    createdAt: '',
  }
  const owner: Me = {
    ...viewerWithStaging,
    role: 'owner',
    user: { ...viewerWithStaging.user!, id: 'usr_me', role: 'owner' },
  }

  it('offers a role per environment, defaulting to the main role', async () => {
    const api = client({
      listMembers: vi.fn(async () => [member]),
      listInvites: vi.fn(async () => []),
      updateMember: vi.fn(async () => ({ ...member, environmentRoles: { staging: 'editor' } })),
    })
    const wrapper = mount(MembersPage, {
      props: {
        api,
        me: owner,
        dashboardUrl: 'https://x/',
        environments: ['production', 'staging'],
      },
    })
    await flushPromises()
    const staging = wrapper.find('#env-usr_2-staging')
    expect((staging.element as HTMLSelectElement).value).toBe('')
    expect(staging.findAll('option').map((o) => o.text())).toEqual([
      'Main role (viewer)',
      'viewer',
      'editor',
      'admin',
    ])
    await staging.setValue('editor')
    await flushPromises()
    expect(api.updateMember).toHaveBeenCalledWith('usr_2', {
      environmentRoles: { staging: 'editor' },
    })
    expect(wrapper.emitted('notify')?.[0]?.[0]).toBe('b@example.com is editor in staging.')
  })

  it('is hidden with a single environment', async () => {
    const api = client({
      listMembers: vi.fn(async () => [member]),
      listInvites: vi.fn(async () => []),
    })
    const wrapper = mount(MembersPage, {
      props: { api, me: owner, dashboardUrl: 'https://x/', environments: ['production'] },
    })
    await flushPromises()
    expect(wrapper.find('.env-roles').exists()).toBe(false)
  })
})
