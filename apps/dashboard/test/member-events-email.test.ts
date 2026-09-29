import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { AdminClient, Me } from '../src/api'
import MembersPage from '../src/components/MembersPage.vue'
import WebhooksPage from '../src/components/WebhooksPage.vue'

const owner: Me = {
  identity: 'o@example.com',
  role: 'owner',
  accounts: true,
  user: {
    id: 'usr_o',
    email: 'o@example.com',
    name: 'O',
    role: 'owner',
    status: 'active',
    createdAt: '',
  },
  session: { id: 'ses_1', createdAt: '', expiresAt: '' },
}

describe('emailed invites', () => {
  it('say the link was emailed, and still show it', async () => {
    const api = {
      listMembers: vi.fn(async () => []),
      listInvites: vi.fn(async () => []),
      createInvite: vi.fn(async () => ({
        token: 'fh_inv_abc',
        emailed: true,
        invite: {
          id: 'inv_1',
          kind: 'invite' as const,
          email: 'new@example.com',
          role: 'viewer',
          invitedBy: 'o@example.com',
          createdAt: '',
          expiresAt: '2026-10-01T00:00:00.000Z',
        },
      })),
    } as unknown as AdminClient
    const wrapper = mount(MembersPage, {
      props: { api, me: owner, dashboardUrl: 'https://x/admin/' },
    })
    await flushPromises()
    await wrapper.find('#invite-email').setValue('new@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.link-note.emailed').text()).toContain('Emailed to new@example.com')
    expect((wrapper.find('#shown-link').element as HTMLInputElement).value).toContain('fh_inv_abc')
  })
})

describe('member events on the Webhooks page', () => {
  it('are offered separately and left off by default', async () => {
    const createWebhook = vi.fn(async (input: { events?: string[] }) => ({
      id: 'wh_1',
      url: 'https://h',
      secret: 's',
      events: input.events ?? [],
      enabled: true,
      createdAt: '',
      updatedAt: '',
    }))
    const api = { listWebhooks: vi.fn(async () => []), createWebhook } as unknown as AdminClient
    const wrapper = mount(WebhooksPage, { props: { api } })
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Add webhook'))!
      .trigger('click')
    // Member events are opt-in chips, separate from the flag-event chips and off by default.
    const memberLabels = [
      'Member invited',
      'Member joined',
      'Role changed',
      'Member disabled',
      'Member enabled',
      'Member removed',
    ]
    const memberChips = wrapper
      .findAll('.event-chip')
      .filter((c) => memberLabels.includes(c.text()))
    expect(memberChips).toHaveLength(6)
    expect(memberChips.every((c) => c.attributes('aria-pressed') === 'false')).toBe(true)

    await wrapper.find('input[type="url"]').setValue('https://hooks.example.com/in')
    await memberChips.find((c) => c.text() === 'Member joined')!.trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Create')!
      .trigger('click')
    await flushPromises()
    const events = createWebhook.mock.calls[0]![0].events!
    expect(events).toContain('flag.created')
    expect(events).toContain('member.joined')
    expect(events).not.toContain('member.invited')
  })
})
