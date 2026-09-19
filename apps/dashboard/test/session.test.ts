import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type AdminClient, type FeatureFlag } from '../src/api'
import App from '../src/App.vue'
import TokenGate from '../src/components/TokenGate.vue'

const createAdminClient = vi.fn<(opts: { url: string; token: string }) => AdminClient>()
vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api')>()
  return {
    ...actual,
    createAdminClient: (opts: { url: string; token: string }) => createAdminClient(opts),
  }
})

const flag = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  key: 'checkout-v2',
  enabled: true,
  rollout: { percentage: 25 },
  description: 'Redesigned checkout',
  metadata: {
    createdBy: 'admin',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedBy: 'admin',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
  ...over,
})

function client(over: Partial<AdminClient> = {}): AdminClient {
  return {
    list: vi.fn(async () => [flag()]),
    get: vi.fn(async () => flag()),
    put: vi.fn(async () => flag()),
    delete: vi.fn(async () => undefined),
    archive: vi.fn(async () => ({
      ...flag(),
      archived: true,
      archivedAt: new Date().toISOString(),
    })),
    restore: vi.fn(async () => flag()),
    ...over,
  }
}

async function mountSignedIn(api: AdminClient) {
  sessionStorage.setItem('flaghoist.admin', JSON.stringify({ url: 'https://x.dev', token: 't' }))
  createAdminClient.mockReturnValue(api)
  const wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

async function navigateToFlags(wrapper: ReturnType<typeof mount>) {
  const sidebar = wrapper.findComponent({ name: 'Sidebar' })
  sidebar.vm.$emit('navigate', 'flags')
  await flushPromises()
}

function findToast(): Element | null {
  return document.body.querySelector('.toast')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  createAdminClient.mockReset()
  vi.stubGlobal('confirm', () => true)
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('session ends on a rejected token (#31)', () => {
  it('drops to the gate, clears the stored session, and says why', async () => {
    const put = vi.fn(async () => {
      throw new ApiError(401, 'admin token has been revoked')
    })
    const wrapper = await mountSignedIn(client({ put }))
    await navigateToFlags(wrapper)

    expect(wrapper.findAll('.flag-row')).toHaveLength(1)
    expect(sessionStorage.getItem('flaghoist.admin')).not.toBeNull()

    await wrapper.find('.flag-row .toggle').trigger('click')
    await flushPromises()

    const gate = wrapper.findComponent(TokenGate)
    expect(gate.exists()).toBe(true)
    expect(gate.props('error')).toMatch(/session ended/i)
    expect(sessionStorage.getItem('flaghoist.admin')).toBeNull()
    wrapper.unmount()
  })

  it('treats a 403 the same way', async () => {
    const put = vi.fn(async () => {
      throw new ApiError(403, 'not an admin')
    })
    const wrapper = await mountSignedIn(client({ put }))
    await navigateToFlags(wrapper)

    await wrapper.find('.flag-row .toggle').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(TokenGate).exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the session for an ordinary failure, and shows the error as a toast', async () => {
    const put = vi.fn(async () => {
      throw new ApiError(500, 'storage adapter unavailable')
    })
    const wrapper = await mountSignedIn(client({ put }))
    await navigateToFlags(wrapper)

    await wrapper.find('.flag-row .toggle').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(TokenGate).exists()).toBe(false)
    const toast = findToast()
    expect(toast).not.toBeNull()
    expect(toast!.textContent).toContain('storage adapter unavailable')
    expect(sessionStorage.getItem('flaghoist.admin')).not.toBeNull()
    wrapper.unmount()
  })

  it('reports an unreachable server without ending the session', async () => {
    const put = vi.fn(async () => {
      throw new ApiError(0, 'Could not reach the server. Check the URL and its CORS allowlist.')
    })
    const wrapper = await mountSignedIn(client({ put }))
    await navigateToFlags(wrapper)

    await wrapper.find('.flag-row .toggle').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(TokenGate).exists()).toBe(false)
    const toast = findToast()
    expect(toast).not.toBeNull()
    expect(toast!.textContent).toMatch(/could not reach the server/i)
    wrapper.unmount()
  })
})

describe('filtering', () => {
  const many = [
    flag({ key: 'checkout-v2', enabled: true, rollout: { percentage: 25 } }),
    flag({ key: 'dark-mode', enabled: true, rollout: { percentage: 100 } }),
    flag({ key: 'pricing-q3', enabled: false, rollout: { percentage: 0 } }),
    flag({
      key: 'eu-banner',
      enabled: true,
      rollout: { percentage: 100 },
      rules: [
        {
          conditions: [{ attribute: 'country', operator: 'in', value: ['DE'] }],
          result: { enabled: true },
        },
      ],
    }),
  ]

  it('narrows by search across key and description', async () => {
    const wrapper = await mountSignedIn(client({ list: vi.fn(async () => many) }))
    await navigateToFlags(wrapper)
    expect(wrapper.findAll('.flag-row')).toHaveLength(4)

    await wrapper.find('.search input').setValue('dark')
    expect(wrapper.findAll('.flag-row')).toHaveLength(1)
    wrapper.unmount()
  })

  it('counts and filters live, paused and targeted correctly', async () => {
    const wrapper = await mountSignedIn(client({ list: vi.fn(async () => many) }))
    await navigateToFlags(wrapper)
    const chips = wrapper.findAll('button.chip')
    const counts = chips.map((c) => c.find('.chip-n').text())
    expect(counts).toEqual(['4', '3', '1', '1'])

    await chips[3].trigger('click')
    expect(wrapper.findAll('.flag-row')).toHaveLength(1)
    expect(wrapper.find('.flag-row .flag-key').text()).toBe('eu-banner')
    wrapper.unmount()
  })

  it('shows a distinct empty state when a search matches nothing', async () => {
    const wrapper = await mountSignedIn(client({ list: vi.fn(async () => many) }))
    await navigateToFlags(wrapper)
    await wrapper.find('.search input').setValue('nothing-here')
    expect(wrapper.find('.empty-state h2').text()).toBe('Nothing matches')
    wrapper.unmount()
  })
})

describe('legacy token migration', () => {
  it('purges a token left in localStorage by an older build', async () => {
    localStorage.setItem('flaghoist.admin', JSON.stringify({ url: 'https://x.dev', token: 'old' }))
    createAdminClient.mockReturnValue(client())
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(localStorage.getItem('flaghoist.admin')).toBeNull()
    wrapper.unmount()
  })
})
