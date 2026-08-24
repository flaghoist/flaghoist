import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api, FeatureFlag } from '../src/api'
import App from '../src/App.vue'
import FlagRow from '../src/components/FlagRow.vue'

const createApi = vi.fn<(url: string, token: string) => Api>()
vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api')>()
  return { ...actual, createApi: (...args: [string, string]) => createApi(...args) }
})

const flag = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  key: 'existing',
  enabled: false,
  rollout: { percentage: 0 },
  description: '',
  metadata: {
    createdBy: 'admin',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedBy: 'admin',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
  ...over,
})

async function mountSignedIn(api: Api) {
  localStorage.setItem('flaghoist.admin', JSON.stringify({ url: 'https://x.dev', token: 't' }))
  createApi.mockReturnValue(api)
  const wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  createApi.mockReset()
  vi.stubGlobal('confirm', () => true)
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => vi.unstubAllGlobals())

/** Click the filter chip whose label starts with the given word. */
async function selectFilter(wrapper: ReturnType<typeof mount>, label: string) {
  const chip = wrapper.findAll('button.chip').find((b) => b.text().toLowerCase().startsWith(label))
  if (!chip) throw new Error(`no ${label} chip`)
  await chip.trigger('click')
}

describe('creating a flag that the active filter would hide', () => {
  // A live flag created while the paused chip is selected was saved, added to the list, and then
  // filtered straight back out of view with no message. It read as the save having failed
  // silently, and the natural next move is to create it again.
  it('clears the filter so the new flag is visible', async () => {
    const created = flag({ key: 'brand-new', enabled: true, rollout: { percentage: 100 } })
    const api: Api = {
      list: vi.fn(async () => [flag()]),
      save: vi.fn(async () => created),
      remove: vi.fn(async () => undefined),
    }
    const wrapper = await mountSignedIn(api)

    await selectFilter(wrapper, 'paused')
    expect(wrapper.findAllComponents(FlagRow)).toHaveLength(1)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New flag')!
      .trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'FlagEditor' }).vm.$emit('save', 'brand-new', {
      enabled: true,
      rollout: { percentage: 100 },
    })
    await flushPromises()

    const keys = wrapper.findAllComponents(FlagRow).map((r) => r.props('flag').key)
    expect(keys).toContain('brand-new')
    expect(wrapper.text()).toContain('Filters were cleared')
  })

  it('leaves the filter alone when the new flag matches it anyway', async () => {
    const created = flag({ key: 'also-paused', enabled: false, rollout: { percentage: 0 } })
    const api: Api = {
      list: vi.fn(async () => [flag()]),
      save: vi.fn(async () => created),
      remove: vi.fn(async () => undefined),
    }
    const wrapper = await mountSignedIn(api)

    await selectFilter(wrapper, 'paused')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New flag')!
      .trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'FlagEditor' }).vm.$emit('save', 'also-paused', {
      enabled: false,
      rollout: { percentage: 0 },
    })
    await flushPromises()

    // Still filtered to paused, and no needless notice, because nothing was hidden.
    expect(wrapper.text()).not.toContain('Filters were cleared')
    const keys = wrapper.findAllComponents(FlagRow).map((r) => r.props('flag').key)
    expect(keys).toContain('also-paused')
  })
})
