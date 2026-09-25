import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  type AdminClient,
  type AuthClient,
  type FeatureFlag,
  type Me,
  type Member,
} from '../src/api'
import App from '../src/App.vue'
import AcceptLink from '../src/components/AcceptLink.vue'
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

function meAs(role: string, id = 'usr_me'): Me {
  return {
    identity: `${role}@example.com`,
    role,
    accounts: true,
    user: {
      id,
      email: `${role}@example.com`,
      name: role,
      role,
      status: 'active',
      createdAt: '2026-09-24T00:00:00.000Z',
    },
    session: { id: 'ses_1', createdAt: '', expiresAt: '' },
  }
}

const member = (over: Partial<Member>): Member => ({
  id: 'usr_x',
  email: 'x@example.com',
  name: '',
  role: 'editor',
  status: 'active',
  createdAt: '2026-09-24T00:00:00.000Z',
  ...over,
})

const flag: FeatureFlag = {
  key: 'checkout',
  enabled: true,
  rollout: { percentage: 100 },
  description: '',
  metadata: { createdBy: 'a', createdAt: '', updatedBy: 'a', updatedAt: '2026-09-24T00:00:00Z' },
}

function client(over: Partial<AdminClient> = {}): AdminClient {
  return {
    list: vi.fn(async () => [flag]),
    listEnvironments: vi.fn(async () => ({ environments: ['production'], default: 'production' })),
    me: vi.fn(async () => meAs('owner')),
    logout: vi.fn(async () => undefined),
    listMembers: vi.fn(async () => []),
    listInvites: vi.fn(async () => []),
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
  history.replaceState(null, '', '/')
})

describe('Members page', () => {
  it('creates an invite and shows the link once, pointing at this dashboard', async () => {
    const api = client({
      createInvite: vi.fn(async () => ({
        token: 'fh_inv_abc',
        invite: {
          id: 'inv_1',
          kind: 'invite' as const,
          email: 'new@example.com',
          role: 'editor',
          invitedBy: 'owner@example.com',
          createdAt: '',
          expiresAt: '2026-10-01T00:00:00.000Z',
        },
      })),
    })
    const wrapper = mount(MembersPage, {
      props: { api, me: meAs('owner'), dashboardUrl: 'https://flags.example.com/admin/' },
    })
    await flushPromises()
    await wrapper.find('#invite-email').setValue('new@example.com')
    await wrapper.find('#invite-role').setValue('editor')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createInvite).toHaveBeenCalledWith({
      dashboardUrl: 'https://flags.example.com/admin/',
      email: 'new@example.com',
      role: 'editor',
    })
    expect(wrapper.find('.link-note.emailed').exists()).toBe(false)
    expect((wrapper.find('#shown-link').element as HTMLInputElement).value).toBe(
      'https://flags.example.com/admin/#accept=fh_inv_abc',
    )
    expect(wrapper.text()).toContain('new@example.com')
  })

  it('offers an admin every role but owner, and no controls over owners or themselves', async () => {
    const api = client({
      listMembers: vi.fn(async () => [
        member({ id: 'usr_owner', email: 'o@example.com', role: 'owner' }),
        member({ id: 'usr_me', email: 'admin@example.com', role: 'admin' }),
        member({ id: 'usr_ed', email: 'ed@example.com', role: 'editor' }),
      ]),
    })
    const wrapper = mount(MembersPage, {
      props: { api, me: meAs('admin'), dashboardUrl: 'https://x/admin/' },
    })
    await flushPromises()
    const options = wrapper.findAll('#invite-role option').map((o) => o.text())
    expect(options).toEqual(['viewer', 'editor', 'admin'])
    const rows = wrapper.findAll('.row')
    expect(rows[0]!.find('select').exists()).toBe(false)
    expect(rows[1]!.find('select').exists()).toBe(false)
    expect(rows[1]!.text()).toContain('You')
    expect(rows[2]!.find('select').exists()).toBe(true)
  })

  it('shows a refused change as a message instead of signing out', async () => {
    const api = client({
      listMembers: vi.fn(async () => [member({ id: 'usr_ed', email: 'ed@example.com' })]),
      updateMember: vi.fn(async () => {
        throw new ApiError(409, 'This is the only owner. Make someone else an owner first.')
      }),
    })
    const wrapper = mount(MembersPage, {
      props: { api, me: meAs('owner'), dashboardUrl: 'https://x/admin/' },
    })
    await flushPromises()
    await wrapper.find('.row select').setValue('admin')
    await flushPromises()
    expect(wrapper.emitted('notify')?.[0]).toEqual([
      'This is the only owner. Make someone else an owner first.',
      'error',
    ])
    expect(wrapper.emitted('failed')).toBeUndefined()
  })

  it('confirms before removing a member', async () => {
    const api = client({
      listMembers: vi.fn(async () => [member({ id: 'usr_ed', email: 'ed@example.com' })]),
      removeMember: vi.fn(async () => undefined),
    })
    const wrapper = mount(MembersPage, {
      props: { api, me: meAs('owner'), dashboardUrl: 'https://x/admin/' },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.find('button[aria-label="Remove ed@example.com"]').trigger('click')
    expect(api.removeMember).not.toHaveBeenCalled()
    const confirm = [...document.querySelectorAll('.confirm button')].find(
      (b) => b.textContent?.trim() === 'Remove',
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()
    expect(api.removeMember).toHaveBeenCalledWith('usr_ed')
    expect(wrapper.findAll('.row')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('accepting a link', () => {
  const info = {
    kind: 'invite' as const,
    email: 'new@example.com',
    role: 'editor',
    expiresAt: '2026-10-01T00:00:00.000Z',
  }

  it('sets a password, joins, and hands the session to the app', async () => {
    const auth = {
      config: vi.fn(),
      signIn: vi.fn(),
      inspectLink: vi.fn(async () => info),
      acceptLink: vi.fn(async () => ({ token: 'fh_sess_new', expiresAt: '', user: {} as never })),
    }
    createAuthClient.mockReturnValue(auth as unknown as AuthClient)
    const wrapper = mount(AcceptLink, { props: { serverUrl: 'https://x', token: 'fh_inv_abc' } })
    await flushPromises()
    expect(wrapper.text()).toContain('new@example.com')
    await wrapper.find('#accept-name').setValue('New Person')
    await wrapper.find('#accept-password').setValue('correct horse battery')
    await wrapper.find('#accept-confirm').setValue('correct horse battery')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(auth.acceptLink).toHaveBeenCalledWith('fh_inv_abc', {
      name: 'New Person',
      password: 'correct horse battery',
    })
    expect(wrapper.emitted('signedIn')?.[0]).toEqual(['https://x', 'fh_sess_new'])
  })

  it('explains a used or expired link', async () => {
    createAuthClient.mockReturnValue({
      inspectLink: vi.fn(async () => {
        throw new ApiError(410, 'This link has expired or was already used.', 'link_invalid')
      }),
    } as unknown as AuthClient)
    const wrapper = mount(AcceptLink, { props: { serverUrl: 'https://x', token: 'fh_inv_old' } })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toMatch(/expired or was already used/)
  })

  it('opens from the address bar and removes the token from it once used', async () => {
    history.replaceState(null, '', '/admin/#accept=fh_inv_abc')
    createAuthClient.mockReturnValue({
      config: vi.fn(async () => ({ accounts: true, password: { kdf: '', iterations: 1 } })),
      inspectLink: vi.fn(async () => info),
      acceptLink: vi.fn(async () => ({ token: 'fh_sess_new', expiresAt: '', user: {} as never })),
    } as unknown as AuthClient)
    createAdminClient.mockReturnValue(client({ me: vi.fn(async () => meAs('editor')) }))
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.findComponent(AcceptLink).exists()).toBe(true)
    await wrapper.find('#accept-password').setValue('correct horse battery')
    await wrapper.find('#accept-confirm').setValue('correct horse battery')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(window.location.hash).toBe('')
    expect(createAdminClient).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'fh_sess_new' }),
    )
    expect(wrapper.findComponent(AcceptLink).exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('role-aware interface', () => {
  async function signedInAs(role: string) {
    sessionStorage.setItem(
      'flaghoist.admin',
      JSON.stringify({ url: 'https://x.dev', token: 'fh_sess_abc' }),
    )
    createAuthClient.mockReturnValue({ config: vi.fn(async () => ({ accounts: true })) } as never)
    createAdminClient.mockReturnValue(client({ me: vi.fn(async () => meAs(role)) }))
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    wrapper.findComponent({ name: 'Sidebar' }).vm.$emit('navigate', 'flags')
    await flushPromises()
    return wrapper
  }

  const navLabels = (w: Awaited<ReturnType<typeof signedInAs>>) =>
    w.findAll('.nav-item').map((b) => b.text().replace(/\d+$/, ''))

  it('gives a viewer read-only flags and no admin pages', async () => {
    const wrapper = await signedInAs('viewer')
    expect(wrapper.find('.read-only-note').exists()).toBe(true)
    expect(wrapper.find('.flag-row .toggle').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('button').some((b) => b.text() === 'New flag')).toBe(false)
    expect(navLabels(wrapper)).not.toContain('Webhooks')
    expect(navLabels(wrapper)).not.toContain('Members')
    wrapper.unmount()
  })

  it('lets an editor change flags but not import, delete or manage members', async () => {
    const wrapper = await signedInAs('editor')
    expect(wrapper.find('.read-only-note').exists()).toBe(false)
    expect(wrapper.find('.flag-row .toggle').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('button').some((b) => b.text().includes('Import'))).toBe(false)
    expect(navLabels(wrapper)).not.toContain('Members')
    wrapper.unmount()
  })

  it('shows Members and Webhooks to an admin', async () => {
    const wrapper = await signedInAs('admin')
    expect(navLabels(wrapper)).toEqual(expect.arrayContaining(['Webhooks', 'Members', 'Account']))
    wrapper.unmount()
  })
})
