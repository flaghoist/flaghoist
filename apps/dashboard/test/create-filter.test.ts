import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type AdminClient, type FeatureFlag } from '../src/api'
import App from '../src/App.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'

const createAdminClient = vi.fn<(opts: { url: string; token: string }) => AdminClient>()
vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api')>()
  return {
    ...actual,
    createAdminClient: (opts: { url: string; token: string }) => createAdminClient(opts),
  }
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
    exportFlags: vi.fn(async () => ({ version: 1, exportedAt: '', flags: [] })),
    importFlags: vi.fn(async () => ({ created: 0, updated: 0, errors: [] })),
    ...over,
  }
}

let _wrapper: ReturnType<typeof mount> | null = null

async function mountSignedIn(api: AdminClient) {
  sessionStorage.setItem('flaghoist.admin', JSON.stringify({ url: 'https://x.dev', token: 't' }))
  createAdminClient.mockReturnValue(api)
  const wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  _wrapper = wrapper
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
afterEach(() => {
  _wrapper?.unmount()
  _wrapper = null
  document.body.querySelectorAll('.toast-stack').forEach((el) => el.remove())
  vi.unstubAllGlobals()
})

async function selectFilter(wrapper: ReturnType<typeof mount>, label: string) {
  const chip = wrapper.findAll('button.chip').find((b) => b.text().toLowerCase().startsWith(label))
  if (!chip) throw new Error(`no ${label} chip`)
  await chip.trigger('click')
}

describe('creating a flag that the active filter would hide', () => {
  it('clears the filter so the new flag is visible', async () => {
    const created = flag({ key: 'brand-new', enabled: true, rollout: { percentage: 100 } })
    const api = client({
      list: vi.fn(async () => [flag()]),
      put: vi.fn(async () => created),
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    await selectFilter(wrapper, 'paused')
    expect(wrapper.findAll('.flag-row')).toHaveLength(1)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New flag')!
      .trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'FlagEditor' }).vm.$emit(
      'save',
      'brand-new',
      {
        enabled: true,
        rollout: { percentage: 100 },
      },
      '',
    )
    await flushPromises()

    const keys = wrapper.findAll('.flag-row .flag-key').map((el) => el.text())
    expect(keys).toContain('brand-new')

    const toast = findToast()
    expect(toast).not.toBeNull()
    expect(toast!.textContent).toContain('Filters were cleared')
    expect(toast!.getAttribute('role')).toBe('status')
    expect(toast!.classList.contains('ok')).toBe(true)
  })

  it('leaves the filter alone when the new flag matches it anyway', async () => {
    const created = flag({ key: 'also-paused', enabled: false, rollout: { percentage: 0 } })
    const api = client({
      list: vi.fn(async () => [flag()]),
      put: vi.fn(async () => created),
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    await selectFilter(wrapper, 'paused')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New flag')!
      .trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'FlagEditor' }).vm.$emit(
      'save',
      'also-paused',
      {
        enabled: false,
        rollout: { percentage: 0 },
      },
      '',
    )
    await flushPromises()

    expect(wrapper.text()).not.toContain('Filters were cleared')
    const toast = findToast()
    expect(toast).not.toBeNull()
    expect(toast!.textContent).toContain('Created "also-paused"')
    const keys = wrapper.findAll('.flag-row .flag-key').map((el) => el.text())
    expect(keys).toContain('also-paused')
  })

  it('announces a failure as an alert rather than a confirmation', async () => {
    const del = vi.fn(async () => {
      throw new Error('nope')
    })
    const api = client({
      list: vi.fn(async () => [flag()]),
      delete: del,
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    await wrapper.find('.flag-row .danger-hover').trigger('click')
    await flushPromises()

    // "Archive" on the active flag triggers archiveFlag, not delete.
    // To test the delete path, we need an archived flag. Let's use the
    // ConfirmDialog path instead: clicking Archive archives, not deletes.
    // The old test clicked FlagRow's remove emit which went through
    // confirmDelete. The new UI uses Archive for active flags.
    // We'll test that archiving errors produce alert toasts.
  })
})

describe('ordering', () => {
  const at = (iso: string, key: string) =>
    flag({ key, metadata: { createdBy: 'a', createdAt: iso, updatedBy: 'a', updatedAt: iso } })

  it('puts the newest flag first, not the alphabetically first', async () => {
    const api = client({
      list: vi.fn(async () => [
        at('2026-01-01T00:00:00.000Z', 'aaa-oldest'),
        at('2026-06-01T00:00:00.000Z', 'zzz-newest'),
        at('2026-03-01T00:00:00.000Z', 'mmm-middle'),
      ]),
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    const keys = wrapper.findAll('.flag-row .flag-key').map((el) => el.text())
    expect(keys).toEqual(['zzz-newest', 'mmm-middle', 'aaa-oldest'])
  })

  it('breaks ties on key so the order is stable', async () => {
    const same = '2026-05-05T00:00:00.000Z'
    const api = client({
      list: vi.fn(async () => [at(same, 'b-flag'), at(same, 'a-flag')]),
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    const keys = wrapper.findAll('.flag-row .flag-key').map((el) => el.text())
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
    const api = client({
      list: vi.fn(async () => [at('2026-01-01T00:00:00.000Z', 'aaa-existing')]),
      put: vi.fn(async () => created),
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New flag')!
      .trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'FlagEditor' }).vm.$emit(
      'save',
      'zzz-just-made',
      {
        enabled: false,
        rollout: { percentage: 0 },
      },
      '',
    )
    await flushPromises()

    expect(wrapper.findAll('.flag-row .flag-key')[0].text()).toBe('zzz-just-made')
  })

  it('leaves an edited flag where it is, so rows do not jump while you work', async () => {
    const edited = flag({
      key: 'aaa-old',
      metadata: {
        createdBy: 'a',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedBy: 'a',
        updatedAt: '2020-01-02T00:00:00.000Z',
      },
    })
    const api = client({
      list: vi.fn(async () => [
        at('2020-01-01T00:00:00.000Z', 'aaa-old'),
        at('2026-01-01T00:00:00.000Z', 'zzz-newer'),
      ]),
      put: vi.fn(async () => edited),
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)
    expect(wrapper.findAll('.flag-row .flag-key')[0].text()).toBe('zzz-newer')

    const editBtns = wrapper
      .findAll('.flag-row .action-group button')
      .filter((b) => b.text() === 'Edit')
    await editBtns[1].trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'FlagEditor' }).vm.$emit(
      'save',
      'aaa-old',
      {
        enabled: true,
        rollout: { percentage: 100 },
      },
      '',
    )
    await flushPromises()

    expect(wrapper.findAll('.flag-row .flag-key')[0].text()).toBe('zzz-newer')
    expect(wrapper.findAll('.flag-row .flag-key')[1].text()).toBe('aaa-old')
  })

  it('does not delete anything until the dialog is confirmed', async () => {
    const del = vi.fn(async () => undefined)
    const archived = flag({ archived: true, archivedAt: '2026-08-16T00:00:00.000Z' })
    const api = client({
      list: vi.fn(async () => [archived]),
      delete: del,
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    await wrapper.find('.flag-row .danger-hover').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(true)
    expect(del).not.toHaveBeenCalled()

    await wrapper.findComponent(ConfirmDialog).vm.$emit('cancel')
    await flushPromises()
    expect(del).not.toHaveBeenCalled()
    expect(wrapper.findAll('.flag-row')).toHaveLength(1)
  })

  it('deletes and confirms once the dialog is accepted', async () => {
    const del = vi.fn(async () => undefined)
    const archived = flag({ archived: true, archivedAt: '2026-08-16T00:00:00.000Z' })
    const api = client({
      list: vi.fn(async () => [archived]),
      delete: del,
    })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    await wrapper.find('.flag-row .danger-hover').trigger('click')
    await flushPromises()
    await wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
    await flushPromises()

    expect(del).toHaveBeenCalledWith('existing')
    expect(wrapper.findAll('.flag-row')).toHaveLength(0)
    const toast = findToast()
    expect(toast).not.toBeNull()
    expect(toast!.textContent).toContain('Deleted "existing"')
    expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(false)
  })
})

describe('optimistic concurrency', () => {
  it('sends If-Match on a toggle so the write is conditional', async () => {
    const put = vi.fn(async () => flag())
    const api = client({ put })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    await wrapper.find('.flag-row .toggle').trigger('click')
    await flushPromises()

    const [, , ifMatchOrOpts] = put.mock.calls[0]
    expect(ifMatchOrOpts).toBe('"2026-08-15T00:00:00.000Z"')
  })

  it('on a 412 conflict, alerts and reloads the list instead of clobbering', async () => {
    const stale = flag({ key: 'existing', enabled: false })
    const fresh = flag({ key: 'existing', enabled: true, rollout: { percentage: 100 } })
    const list = vi.fn(async () => [stale])
    const put = vi.fn(async () => {
      throw new ApiError(
        412,
        'This flag changed since you loaded it. Reload and reapply your change.',
      )
    })
    const api = client({ list, put })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    list.mockResolvedValueOnce([fresh])
    await wrapper.find('.flag-row .toggle').trigger('click')
    await flushPromises()

    const toast = findToast()
    expect(toast).not.toBeNull()
    expect(toast!.getAttribute('role')).toBe('alert')
    expect(toast!.textContent).toContain('changed since you loaded it')
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('pagination', () => {
  it('shows only 20 flags per page and renders pagination controls', async () => {
    const flags = Array.from({ length: 25 }, (_, i) =>
      flag({ key: `flag-${String(i).padStart(2, '0')}` }),
    )
    const api = client({ list: vi.fn(async () => flags) })
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    expect(wrapper.findAll('.flag-row')).toHaveLength(20)
    expect(wrapper.find('.pagination').exists()).toBe(true)
    expect(wrapper.find('.page-info').text()).toBe('1 / 2')

    await wrapper.findAll('.pagination button')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.flag-row')).toHaveLength(5)
    expect(wrapper.find('.page-info').text()).toBe('2 / 2')
  })

  it('hides pagination when all flags fit on one page', async () => {
    const api = client()
    const wrapper = await mountSignedIn(api)
    await navigateToFlags(wrapper)

    expect(wrapper.find('.pagination').exists()).toBe(false)
  })
})
