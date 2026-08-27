import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Api, type FeatureFlag } from '../src/api'
import App from '../src/App.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
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
  sessionStorage.setItem('flaghoist.admin', JSON.stringify({ url: 'https://x.dev', token: 't' }))
  createApi.mockReturnValue(api)
  const wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
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

    // A confirmation reports, it does not interrupt.
    const strip = wrapper.find('.notice')
    expect(strip.attributes('role')).toBe('status')
    expect(strip.classes()).toContain('ok')
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

    // Still filtered to paused, and no claim that filters moved, because nothing was hidden.
    expect(wrapper.text()).not.toContain('Filters were cleared')
    // The create is still confirmed, since an alphabetical list can put the new row off screen.
    expect(wrapper.find('.notice').text()).toContain('Created "also-paused"')
    const keys = wrapper.findAllComponents(FlagRow).map((r) => r.props('flag').key)
    expect(keys).toContain('also-paused')
  })

  it('announces a failure as an alert rather than a confirmation', async () => {
    const api: Api = {
      list: vi.fn(async () => [flag()]),
      save: vi.fn(async () => flag()),
      remove: vi.fn(async () => {
        throw new Error('nope')
      }),
    }
    const wrapper = await mountSignedIn(api)
    await wrapper.findComponent(FlagRow).vm.$emit('remove')
    await flushPromises()
    // Deleting asks first, in the page, so the failure only happens after confirming.
    await wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
    await flushPromises()

    const strip = wrapper.find('.notice')
    expect(strip.attributes('role')).toBe('alert')
    expect(strip.classes()).toContain('error')
  })
})

describe('ordering', () => {
  const at = (iso: string, key: string) =>
    flag({ key, metadata: { createdBy: 'a', createdAt: iso, updatedBy: 'a', updatedAt: iso } })

  it('puts the newest flag first, not the alphabetically first', async () => {
    const api: Api = {
      list: vi.fn(async () => [
        at('2026-01-01T00:00:00.000Z', 'aaa-oldest'),
        at('2026-06-01T00:00:00.000Z', 'zzz-newest'),
        at('2026-03-01T00:00:00.000Z', 'mmm-middle'),
      ]),
      save: vi.fn(async () => flag()),
      remove: vi.fn(async () => undefined),
    }
    const wrapper = await mountSignedIn(api)

    const keys = wrapper.findAllComponents(FlagRow).map((r) => r.props('flag').key)
    expect(keys).toEqual(['zzz-newest', 'mmm-middle', 'aaa-oldest'])
  })

  it('breaks ties on key so the order is stable', async () => {
    const same = '2026-05-05T00:00:00.000Z'
    const api: Api = {
      list: vi.fn(async () => [at(same, 'b-flag'), at(same, 'a-flag')]),
      save: vi.fn(async () => flag()),
      remove: vi.fn(async () => undefined),
    }
    const wrapper = await mountSignedIn(api)

    const keys = wrapper.findAllComponents(FlagRow).map((r) => r.props('flag').key)
    expect(keys).toEqual(['a-flag', 'b-flag'])
  })

  it('shows a newly created flag at the top', async () => {
    const created = flag({
      key: 'zzz-just-made',
      metadata: {
        createdBy: 'a',
        createdAt: '2027-01-01T00:00:00.000Z',
        updatedBy: 'a',
        updatedAt: '2027-01-01T00:00:00.000Z',
      },
    })
    const api: Api = {
      list: vi.fn(async () => [at('2026-01-01T00:00:00.000Z', 'aaa-existing')]),
      save: vi.fn(async () => created),
      remove: vi.fn(async () => undefined),
    }
    const wrapper = await mountSignedIn(api)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New flag')!
      .trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'FlagEditor' }).vm.$emit('save', 'zzz-just-made', {
      enabled: false,
      rollout: { percentage: 0 },
    })
    await flushPromises()

    expect(wrapper.findAllComponents(FlagRow)[0].props('flag').key).toBe('zzz-just-made')
  })

  it('leaves an edited flag where it is, so rows do not jump while you work', async () => {
    const edited = flag({
      key: 'aaa-old',
      metadata: {
        createdBy: 'a',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedBy: 'a',
        updatedAt: '2027-06-06T00:00:00.000Z',
      },
    })
    const api: Api = {
      list: vi.fn(async () => [
        at('2020-01-01T00:00:00.000Z', 'aaa-old'),
        at('2026-01-01T00:00:00.000Z', 'zzz-newer'),
      ]),
      save: vi.fn(async () => edited),
      remove: vi.fn(async () => undefined),
    }
    const wrapper = await mountSignedIn(api)
    expect(wrapper.findAllComponents(FlagRow)[0].props('flag').key).toBe('zzz-newer')

    await wrapper.findAllComponents(FlagRow)[1].vm.$emit('edit')
    await flushPromises()
    wrapper.findComponent({ name: 'FlagEditor' }).vm.$emit('save', 'aaa-old', {
      enabled: true,
      rollout: { percentage: 100 },
    })
    await flushPromises()

    // Still second. Editing changed updatedAt, and the order deliberately ignores that.
    expect(wrapper.findAllComponents(FlagRow)[0].props('flag').key).toBe('zzz-newer')
    expect(wrapper.findAllComponents(FlagRow)[1].props('flag').key).toBe('aaa-old')
  })

  it('does not delete anything until the dialog is confirmed', async () => {
    const remove = vi.fn(async () => undefined)
    const api: Api = { list: vi.fn(async () => [flag()]), save: vi.fn(async () => flag()), remove }
    const wrapper = await mountSignedIn(api)

    await wrapper.findComponent(FlagRow).vm.$emit('remove')
    await flushPromises()
    expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(true)
    expect(remove).not.toHaveBeenCalled()

    // Cancelling must leave the flag alone. window.confirm returning false used to be
    // indistinguishable from the button doing nothing at all.
    await wrapper.findComponent(ConfirmDialog).vm.$emit('cancel')
    await flushPromises()
    expect(remove).not.toHaveBeenCalled()
    expect(wrapper.findAllComponents(FlagRow)).toHaveLength(1)
  })

  it('deletes and confirms once the dialog is accepted', async () => {
    const remove = vi.fn(async () => undefined)
    const api: Api = { list: vi.fn(async () => [flag()]), save: vi.fn(async () => flag()), remove }
    const wrapper = await mountSignedIn(api)

    await wrapper.findComponent(FlagRow).vm.$emit('remove')
    await flushPromises()
    await wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith('existing')
    expect(wrapper.findAllComponents(FlagRow)).toHaveLength(0)
    expect(wrapper.find('.notice').text()).toContain('Deleted "existing"')
    expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(false)
  })
})

describe('optimistic concurrency', () => {
  it('sends If-Match on a toggle so the write is conditional', async () => {
    const save = vi.fn(async () => flag())
    const api: Api = {
      list: vi.fn(async () => [flag()]),
      save,
      remove: vi.fn(async () => undefined),
    }
    const wrapper = await mountSignedIn(api)

    await wrapper.findComponent(FlagRow).vm.$emit('toggle')
    await flushPromises()

    // save(key, input, ifMatch) — the third argument is the flag's ETag, from its updatedAt.
    const [, , ifMatch] = save.mock.calls[0]
    expect(ifMatch).toBe('"2026-08-15T00:00:00.000Z"')
  })

  it('on a 412 conflict, alerts and reloads the list instead of clobbering', async () => {
    const stale = flag({ key: 'existing', enabled: false })
    const fresh = flag({ key: 'existing', enabled: true, rollout: { percentage: 100 } })
    const list = vi.fn(async () => [stale])
    const save = vi.fn(async () => {
      throw new ApiError(
        412,
        'This flag changed since you loaded it. Reload and reapply your change.',
      )
    })
    const api: Api = { list, save, remove: vi.fn(async () => undefined) }
    const wrapper = await mountSignedIn(api)

    list.mockResolvedValueOnce([fresh]) // the post-conflict reload returns the current state
    await wrapper.findComponent(FlagRow).vm.$emit('toggle')
    await flushPromises()

    const strip = wrapper.find('.notice')
    expect(strip.attributes('role')).toBe('alert')
    expect(strip.text()).toContain('changed since you loaded it')
    expect(list).toHaveBeenCalledTimes(2) // once on mount, once on the conflict reload
    expect(wrapper.findComponent(FlagRow).props('flag').enabled).toBe(true) // reflects the reload
  })
})
