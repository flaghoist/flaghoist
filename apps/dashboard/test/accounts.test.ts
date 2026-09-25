import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type AdminClient, type AuthClient, type Me } from '../src/api'
import App from '../src/App.vue'
import AccountPage from '../src/components/AccountPage.vue'
import AuditLog from '../src/components/AuditLog.vue'
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

const ADA: Me = {
  identity: 'ada@example.com',
  role: 'owner',
  accounts: true,
  user: {
    id: 'usr_1',
    email: 'ada@example.com',
    name: 'Ada',
    role: 'owner',
    status: 'active',
    createdAt: '2026-09-24T00:00:00.000Z',
  },
  session: { id: 'ses_1', createdAt: '', expiresAt: '' },
}

function client(over: Partial<AdminClient> = {}): AdminClient {
  return {
    list: vi.fn(async () => []),
    listEnvironments: vi.fn(async () => ({ environments: ['production'], default: 'production' })),
    me: vi.fn(async () => ADA),
    logout: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => []),
    listTokens: vi.fn(async () => []),
    ...over,
  } as unknown as AdminClient
}

function authClient(over: Partial<AuthClient> = {}): AuthClient {
  return {
    config: vi.fn(async () => ({
      accounts: true,
      password: { kdf: 'pbkdf2-sha256', iterations: 600000 },
      setupRequired: false,
    })),
    signIn: vi.fn(async () => ({
      token: 'fh_sess_abc',
      expiresAt: '',
      user: ADA.user!,
    })),
    ...over,
  }
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
afterEach(() => vi.unstubAllGlobals())

describe('sign-in screen', () => {
  it('asks for an email and password when the server has accounts', async () => {
    createAuthClient.mockReturnValue(authClient())
    const wrapper = mount(TokenGate)
    await flushPromises()
    expect(wrapper.find('#gate-email').exists()).toBe(true)
    expect(wrapper.find('#gate-password').exists()).toBe(true)
    expect(wrapper.find('#gate-token').exists()).toBe(false)

    await wrapper.find('button.switch').trigger('click')
    expect(wrapper.find('#gate-token').exists()).toBe(true)
  })

  it('keeps the token form for a server without accounts', async () => {
    createAuthClient.mockReturnValue(
      authClient({ config: vi.fn(async () => ({ accounts: false })) }),
    )
    const wrapper = mount(TokenGate)
    await flushPromises()
    expect(wrapper.find('#gate-token').exists()).toBe(true)
    expect(wrapper.find('button.switch').exists()).toBe(false)
  })

  it('sends someone to the token form while no account exists yet', async () => {
    createAuthClient.mockReturnValue(
      authClient({
        config: vi.fn(async () => ({
          accounts: true,
          password: { kdf: 'pbkdf2-sha256', iterations: 600000 },
          setupRequired: true,
        })),
      }),
    )
    const wrapper = mount(TokenGate)
    await flushPromises()
    expect(wrapper.find('#gate-token').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/No accounts exist yet/)
  })

  it('signs in, keeps the session token, and offers the Account page', async () => {
    const auth = authClient()
    createAuthClient.mockReturnValue(auth)
    createAdminClient.mockReturnValue(client())
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.find('#gate-email').setValue('ada@example.com')
    await wrapper.find('#gate-password').setValue('correct horse battery')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(auth.signIn).toHaveBeenCalledWith('ada@example.com', 'correct horse battery')
    expect(createAdminClient).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'fh_sess_abc' }),
    )
    expect(wrapper.findComponent(TokenGate).exists()).toBe(false)
    expect(JSON.parse(sessionStorage.getItem('flaghoist.admin')!).token).toBe('fh_sess_abc')
    expect(wrapper.findAll('.nav-item').some((b) => b.text() === 'Account')).toBe(true)
    wrapper.unmount()
  })

  it('shows one message for a wrong password', async () => {
    createAuthClient.mockReturnValue(
      authClient({
        signIn: vi.fn(async () => {
          throw new ApiError(401, 'Invalid email or password.', 'invalid_credentials')
        }),
      }),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    await wrapper.find('#gate-email').setValue('ada@example.com')
    await wrapper.find('#gate-password').setValue('wrong password here')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.err').text()).toBe('Invalid email or password.')
    wrapper.unmount()
  })

  it('ends the session on the server when signing out', async () => {
    createAuthClient.mockReturnValue(authClient())
    const api = client()
    createAdminClient.mockReturnValue(api)
    sessionStorage.setItem(
      'flaghoist.admin',
      JSON.stringify({ url: 'https://x.dev', token: 'fh_sess_abc' }),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    wrapper.findComponent({ name: 'Sidebar' }).vm.$emit('disconnect')
    await flushPromises()
    expect(api.logout).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('says the session ended when the server expires it', async () => {
    createAuthClient.mockReturnValue(authClient())
    createAdminClient.mockReturnValue(
      client({
        list: vi.fn(async () => {
          throw new ApiError(401, 'Your session has ended. Sign in again.', 'session_expired')
        }),
      }),
    )
    sessionStorage.setItem(
      'flaghoist.admin',
      JSON.stringify({ url: 'https://x.dev', token: 'fh_sess_abc' }),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.findComponent(TokenGate).props('error')).toBe(
      'Your session ended. Sign in again.',
    )
    wrapper.unmount()
  })
})

describe('Account page', () => {
  it('changes the password and reports the sessions it signed out', async () => {
    const api = client({ changePassword: vi.fn(async () => ({ revokedSessions: 2 })) })
    const wrapper = mount(AccountPage, { props: { api, me: ADA, setupRequired: false } })
    await flushPromises()
    await wrapper.find('#pw-current').setValue('correct horse battery')
    await wrapper.find('#pw-next').setValue('a different long passphrase')
    await wrapper.find('#pw-confirm').setValue('a different long passphrase')
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect(api.changePassword).toHaveBeenCalledWith({
      email: 'ada@example.com',
      currentPassword: 'correct horse battery',
      newPassword: 'a different long passphrase',
    })
    expect(wrapper.emitted('notify')?.[0]?.[0]).toMatch(/Signed out 2 other sessions/)
  })

  it('refuses a short or mismatched new password before calling the server', async () => {
    const api = client({ changePassword: vi.fn() })
    const wrapper = mount(AccountPage, { props: { api, me: ADA, setupRequired: false } })
    await wrapper.find('#pw-current').setValue('correct horse battery')
    await wrapper.find('#pw-next').setValue('short')
    await wrapper.find('#pw-confirm').setValue('short')
    await wrapper.findAll('form')[0]!.trigger('submit')
    expect(wrapper.find('.err').text()).toMatch(/at least 12 characters/)
    await wrapper.find('#pw-next').setValue('long enough passphrase')
    await wrapper.find('#pw-confirm').setValue('a different passphrase')
    await wrapper.findAll('form')[0]!.trigger('submit')
    expect(wrapper.find('.err').text()).toMatch(/do not match/)
    expect(api.changePassword).not.toHaveBeenCalled()
  })

  it('shows the current wrong-password message inline', async () => {
    const api = client({
      changePassword: vi.fn(async () => {
        throw new ApiError(400, 'Your current password is incorrect.', 'invalid_password')
      }),
    })
    const wrapper = mount(AccountPage, { props: { api, me: ADA, setupRequired: false } })
    await wrapper.find('#pw-current').setValue('not my password')
    await wrapper.find('#pw-next').setValue('a different long passphrase')
    await wrapper.find('#pw-confirm').setValue('a different long passphrase')
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect(wrapper.find('.err').text()).toBe('Your current password is incorrect.')
    expect(wrapper.emitted('failed')).toBeUndefined()
  })

  it('lists sessions and signs out another one', async () => {
    const api = client({
      listSessions: vi.fn(async () => [
        {
          id: 'ses_1',
          createdAt: '2026-09-24T09:00:00.000Z',
          lastSeenAt: '2026-09-24T10:00:00.000Z',
          expiresAt: '',
          userAgent: 'Mozilla/5.0 (Macintosh) Chrome/140 Safari/537',
          current: true,
        },
        {
          id: 'ses_2',
          createdAt: '2026-09-23T09:00:00.000Z',
          lastSeenAt: '2026-09-23T10:00:00.000Z',
          expiresAt: '',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) Firefox/140',
          current: false,
        },
      ]),
      revokeSession: vi.fn(async () => undefined),
    })
    const wrapper = mount(AccountPage, { props: { api, me: ADA, setupRequired: false } })
    await flushPromises()
    const rows = wrapper.findAll('.session-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Chrome on macOS')
    expect(rows[0]!.text()).toContain('This session')
    await rows[1]!.find('button').trigger('click')
    await flushPromises()
    expect(api.revokeSession).toHaveBeenCalledWith('ses_2')
    expect(wrapper.findAll('.session-row')).toHaveLength(1)
  })

  it('offers to create the owner account when signed in with the admin token', async () => {
    const api = client({ createOwner: vi.fn(async () => ADA.user!) })
    const tokenMe: Me = { ...ADA, identity: 'admin token', user: null, session: null }
    const wrapper = mount(AccountPage, { props: { api, me: tokenMe, setupRequired: true } })
    expect(wrapper.text()).toContain('You are signed in with the admin token, not with an account.')
    expect(wrapper.text()).not.toContain('break-glass')
    await wrapper.find('#owner-email').setValue('ada@example.com')
    await wrapper.find('#owner-password').setValue('correct horse battery')
    await wrapper.find('#owner-confirm').setValue('correct horse battery')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createOwner).toHaveBeenCalledWith({
      email: 'ada@example.com',
      name: undefined,
      password: 'correct horse battery',
    })
    expect(wrapper.emitted('ownerCreated')?.[0]).toEqual([
      'ada@example.com',
      'correct horse battery',
    ])
  })
})

describe('Security log', () => {
  function stubAudit() {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ entries: [], total: 0 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('is offered to admins and asks for the security category', async () => {
    const fetch = stubAudit()
    const wrapper = mount(AuditLog, {
      props: { serverUrl: 'https://x.dev', token: 't', canSeeSecurity: true },
    })
    await flushPromises()
    const tab = wrapper.findAll('.audit-tabs .chip').find((b) => b.text() === 'Security')!
    await tab.trigger('click')
    await flushPromises()
    const lastUrl = String(fetch.mock.calls.at(-1)?.[0])
    expect(lastUrl).toContain('category=security')
  })

  it('is hidden below admin', async () => {
    stubAudit()
    const wrapper = mount(AuditLog, {
      props: { serverUrl: 'https://x.dev', token: 't', canSeeSecurity: false },
    })
    await flushPromises()
    expect(wrapper.find('.audit-tabs').exists()).toBe(false)
  })
})

describe('Access tokens', () => {
  const created = {
    token: 'fh_pat_secretvalue',
    info: {
      id: 'tok_1',
      name: 'CI deploys',
      role: 'viewer',
      prefix: 'fh_pat_secr',
      createdAt: '2026-09-24T00:00:00.000Z',
      expiresAt: '2026-10-24T00:00:00.000Z',
    },
  }

  it('creates a token, shows it once, and lists it without the secret', async () => {
    const api = client({ createToken: vi.fn(async () => created) })
    const wrapper = mount(AccountPage, { props: { api, me: ADA, setupRequired: false } })
    await flushPromises()
    await wrapper.find('#token-name').setValue('CI deploys')
    await wrapper.find('#token-role').setValue('viewer')
    await wrapper.find('#token-expiry').setValue('30')
    await wrapper.find('.token-form').trigger('submit')
    await flushPromises()
    expect(api.createToken).toHaveBeenCalledWith({
      name: 'CI deploys',
      role: 'viewer',
      expiresInDays: 30,
    })
    expect((wrapper.find('#new-token').element as HTMLInputElement).value).toBe(
      'fh_pat_secretvalue',
    )
    await wrapper.find('.token-panel .btn-quiet').trigger('click')
    expect(wrapper.text()).not.toContain('fh_pat_secretvalue')
    expect(wrapper.text()).toContain('CI deploys')
  })

  it('offers only roles up to your own, and never-expiring only with a warning', async () => {
    const editor: Me = { ...ADA, role: 'editor', user: { ...ADA.user!, role: 'editor' } }
    const wrapper = mount(AccountPage, {
      props: { api: client(), me: editor, setupRequired: false },
    })
    await flushPromises()
    expect(wrapper.findAll('#token-role option').map((o) => o.text())).toEqual(['viewer', 'editor'])
    expect(wrapper.find('.warn-note').exists()).toBe(false)
    await wrapper.find('#token-expiry').setValue('never')
    expect(wrapper.find('.warn-note').exists()).toBe(true)
  })

  it('revokes a token', async () => {
    const api = client({
      listTokens: vi.fn(async () => [created.info]),
      revokeToken: vi.fn(async () => undefined),
    })
    const wrapper = mount(AccountPage, { props: { api, me: ADA, setupRequired: false } })
    await flushPromises()
    await wrapper.find('button[aria-label="Revoke CI deploys"]').trigger('click')
    await flushPromises()
    expect(api.revokeToken).toHaveBeenCalledWith('tok_1')
    expect(wrapper.text()).toContain('No access tokens yet.')
  })

  it('hides password and sessions when signed in with a token', async () => {
    const viaToken: Me = { ...ADA, session: null, token: created.info }
    const api = client()
    const wrapper = mount(AccountPage, { props: { api, me: viaToken, setupRequired: false } })
    await flushPromises()
    expect(wrapper.find('#pw-current').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sessions')
    expect(api.listSessions).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Signed in with the access token')
  })
})
