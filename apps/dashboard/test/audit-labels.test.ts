import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuditLog from '../src/components/AuditLog.vue'

// Every SecurityAuditAction in packages/core/src/types.ts, written out because core does not
// export them as a list. Add a new action here when adding it there, and this test checks it has a
// label, a description and a tone.
const SECURITY_ACTIONS = [
  'login',
  'login.failed',
  'logout',
  'password.changed',
  'session.revoked',
  'password.reset',
  'user.created',
  'user.updated',
  'user.removed',
  'invite.created',
  'invite.accepted',
  'invite.revoked',
  'token.created',
  'token.revoked',
  'token.expired',
  'two_factor.enabled',
  'two_factor.disabled',
  'two_factor.reset',
  'two_factor.recovery_used',
  'webhook.created',
  'webhook.updated',
  'webhook.deleted',
]

const TONES = ['create', 'update', 'delete', 'archive']
// A raw action name: lowercase words joined by a dot or an underscore, like `two_factor.reset`.
const RAW = /\b[a-z]+(?:[._][a-z]+)+\b/

afterEach(() => vi.unstubAllGlobals())

describe('the Security log', () => {
  it('labels every security action instead of showing its raw name', async () => {
    const entries = SECURITY_ACTIONS.map((action, i) => ({
      id: `e${i}`,
      timestamp: '2026-09-25T10:00:00.000Z',
      action,
      actor: 'Ada',
      target: { type: 'user', id: `usr_${i}` },
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        Response.json(
          String(url).includes('category=security')
            ? { entries, total: entries.length }
            : { entries: [], total: 0 },
        ),
      ),
    )
    const wrapper = mount(AuditLog, {
      props: { serverUrl: 'https://x.dev', token: 't', canSeeSecurity: true },
    })
    await flushPromises()
    await wrapper
      .findAll('.audit-tabs .chip')
      .find((b) => b.text() === 'Security')!
      .trigger('click')
    await flushPromises()

    const rows = wrapper.findAll('.log-entry')
    expect(rows).toHaveLength(SECURITY_ACTIONS.length)
    rows.forEach((row, i) => {
      const action = SECURITY_ACTIONS[i]!
      const badge = row.find('.log-action')
      const delta = row.find('.log-delta').text()
      expect(badge.text(), `badge for ${action}`).not.toMatch(RAW)
      expect(badge.text(), `badge for ${action}`).not.toBe('')
      expect(delta, `description for ${action}`).not.toMatch(RAW)
      expect(delta, `description for ${action}`).not.toBe('')
      const tone = badge.classes().find((c) => c !== 'log-action')
      expect(TONES, `tone for ${action}`).toContain(tone)
    })
  })
})
