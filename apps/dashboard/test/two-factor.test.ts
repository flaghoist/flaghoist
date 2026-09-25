import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type AdminClient, type AuthClient, type Me, type Member } from '../src/api'
import App from '../src/App.vue'
import AccountPage from '../src/components/AccountPage.vue'
import MembersPage from '../src/components/MembersPage.vue'
import TokenGate from '../src/components/TokenGate.vue'
import TwoFactorSetup from '../src/components/TwoFactorSetup.vue'

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

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD']

function meWith(twoFactor: NonNullable<Me['twoFactor']>, role = 'editor'): Me {
  return {
    identity: 'ada@example.com',
    role,
    accounts: true,
    passwordSignIn: true,
    user: {
      id: 'usr_1',
      email: 'ada@example.com',
      name: 'Ada',
      role,
      status: 'active',
      hasPassword: true,
      twoFactor: twoFactor.enabled,
      createdAt: '',
    },
    session: { id: 'ses_1', createdAt: '', expiresAt: '' },
    twoFactor,
  }
}

function client(over: Partial<AdminClient> = {}): AdminClient {
  return {
    list: vi.fn(async () => []),
    listEnvironments: vi.fn(async () => ({ environments: ['production'], default: 'production' })),
    me: vi.fn(async () => meWith({ enabled: false, required: false, setupRequired: false })),
    logout: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => []),
    listTokens: vi.fn(async () => []),
    beginTwoFactor: vi.fn(async () => ({
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/Flaghoist%3Aada%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    })),
    confirmTwoFactor: vi.fn(async () => CODES),
    ...over,
  } as unknown as AdminClient
}

function authClient(over: Partial<AuthClient> = {}): AuthClient {
  return {
    config: vi.fn(async () => ({
      accounts: true,
      password: { kdf: 'pbkdf2-sha256', iterations: 600000 },
      passwordSignIn: true,
      sso: null,
      setupRequired: false,
    })),
    signIn: vi.fn(async () => ({ twoFactorRequired: true as const, challenge: 'ch_1' })),
    completeTwoFactor: vi.fn(async () => ({
      token: 'fh_sess_2fa',
      expiresAt: '',
      user: {} as never,
    })),
    ...over,
  } as unknown as AuthClient
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

describe('signing in with two-factor', () => {
  it('asks for the code after the password, then signs in', async () => {
    const auth = authClient()
    createAuthClient.mockReturnValue(auth)
    createAdminClient.mockReturnValue(client())
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    await wrapper.find('#gate-email').setValue('ada@example.com')
    await wrapper.find('#gate-password').setValue('correct horse battery')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('#gate-password').exists()).toBe(false)
    await wrapper.find('#gate-tfa').setValue('123456')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(auth.completeTwoFactor).toHaveBeenCalledWith('ch_1', '123456')
    expect(createAdminClient).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'fh_sess_2fa' }),
    )
    expect(wrapper.findComponent(TokenGate).exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows a wrong code without leaving the code step', async () => {
    createAuthClient.mockReturnValue(
      authClient({
        completeTwoFactor: vi.fn(async () => {
          throw new ApiError(
            401,
            'That code is not right. Enter the current one from your app.',
            'invalid_code',
          )
        }),
      }),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    await wrapper.find('#gate-email').setValue('ada@example.com')
    await wrapper.find('#gate-password').setValue('correct horse battery')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await wrapper.find('#gate-tfa').setValue('000000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#gate-tfa').exists()).toBe(true)
    expect(wrapper.find('.err').text()).toMatch(/not right/)
    wrapper.unmount()
  })
})

describe('setting up two-factor', () => {
  it('shows a QR code and the key, confirms a code, then shows the recovery codes once', async () => {
    const api = client()
    const wrapper = mount(TwoFactorSetup, { props: { api } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.qr svg').exists()).toBe(true)
    expect(wrapper.find('.secret').text()).toBe('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')
    await wrapper.find('#tfa-code').setValue('123456')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.confirmTwoFactor).toHaveBeenCalledWith('123456')
    expect(wrapper.findAll('.codes li').map((li) => li.text())).toEqual(CODES)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'I have saved them')!
      .trigger('click')
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('takes over the dashboard when the role requires it and it is not set up', async () => {
    createAuthClient.mockReturnValue(authClient())
    let enabled = false
    createAdminClient.mockReturnValue(
      client({
        list: vi.fn(async () => {
          if (!enabled) {
            throw new ApiError(403, 'Set it up first.', 'two_factor_setup_required')
          }
          return []
        }),
        me: vi.fn(async () =>
          meWith({ enabled, required: true, setupRequired: !enabled }, 'admin'),
        ),
        confirmTwoFactor: vi.fn(async () => {
          enabled = true
          return CODES
        }),
      }),
    )
    sessionStorage.setItem(
      'flaghoist.admin',
      JSON.stringify({ url: 'https://x.dev', token: 'fh_sess_abc' }),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('.tfa-gate').exists()).toBe(true)
    expect(wrapper.find('.shell').exists()).toBe(false)

    await wrapper.find('.tfa-gate button.btn-primary').trigger('click')
    await flushPromises()
    await wrapper.find('#tfa-code').setValue('123456')
    await wrapper.find('.tfa-gate form').trigger('submit')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'I have saved them')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('.tfa-gate').exists()).toBe(false)
    expect(wrapper.find('.shell').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('managing two-factor', () => {
  it('turns it off with a current code', async () => {
    const api = client({ disableTwoFactor: vi.fn(async () => undefined) })
    const me = meWith({ enabled: true, required: false, setupRequired: false })
    const wrapper = mount(AccountPage, { props: { api, me, setupRequired: false } })
    await flushPromises()
    await wrapper.find('#tfa-manage-code').setValue('654321')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Turn off')!
      .trigger('click')
    await flushPromises()
    expect(api.disableTwoFactor).toHaveBeenCalledWith('654321')
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('offers no way to turn it off when the role requires it', async () => {
    const me = meWith({ enabled: true, required: true, setupRequired: false }, 'admin')
    const wrapper = mount(AccountPage, { props: { api: client(), me, setupRequired: false } })
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text() === 'Turn off')).toBe(false)
    expect(wrapper.text()).toContain('Your role requires it.')
  })

  it('lets an admin reset it for a member, after confirming', async () => {
    const member: Member = {
      id: 'usr_2',
      email: 'b@example.com',
      name: '',
      role: 'editor',
      status: 'active',
      hasPassword: true,
      twoFactor: true,
      createdAt: '',
    }
    const api = client({
      listMembers: vi.fn(async () => [member]),
      listInvites: vi.fn(async () => []),
      resetMemberTwoFactor: vi.fn(async () => undefined),
    })
    const owner = meWith({ enabled: true, required: false, setupRequired: false }, 'owner')
    const wrapper = mount(MembersPage, {
      props: { api, me: owner, dashboardUrl: 'https://x/' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.find('.row').text()).toContain('2FA')
    await wrapper
      .find('button[aria-label="Turn off two-factor sign-in for b@example.com"]')
      .trigger('click')
    expect(api.resetMemberTwoFactor).not.toHaveBeenCalled()
    const confirm = [...document.querySelectorAll('.confirm button')].find(
      (b) => b.textContent?.trim() === 'Turn off',
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()
    expect(api.resetMemberTwoFactor).toHaveBeenCalledWith('usr_2')
    expect(wrapper.find('.row').text()).not.toContain('2FA')
    wrapper.unmount()
  })
})
