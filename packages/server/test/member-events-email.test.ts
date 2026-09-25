import { memoryAdapter } from '@flaghoist/adapter-memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toBase64Url, type UsersConfig } from '../src/accounts'
import { inviteEmail } from '../src/email'
import { apiKey, bearerToken, createFlagServer, type EmailMessage } from '../src/index'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'
const PEPPER = 'pepper-for-tests-0123456789abcdef0123456789'
const HOOK = 'https://hooks.example.com/in'

const key = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
const salt = () => toBase64Url(crypto.getRandomValues(new Uint8Array(16)))

function makeServer(users: Partial<UsersConfig> = {}, extra: { allowedOrigins?: string[] } = {}) {
  return createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
    users: { pepper: PEPPER, ...users },
    ...extra,
  })
}

type App = ReturnType<typeof makeServer>

function call(app: App, method: string, path: string, body?: unknown, token = ADMIN_TOKEN) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function json<T = Record<string, unknown>>(res: Response | Promise<Response>): Promise<T> {
  return (await (await res).json()) as T
}

/** Deliveries made to webhook URLs, parsed. */
let deliveries: { event: string; body: Record<string, unknown> }[]

beforeEach(() => {
  deliveries = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      deliveries.push({
        event: headers.get('x-flaghoist-event') ?? '',
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      })
      return new Response('ok')
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

/** Webhook deliveries are fire-and-forget; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

async function acceptInvite(app: App, token: string) {
  return json<{ token: string; user: { id: string } }>(
    app.request('/api/v1/invites/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, salt: salt(), clientKey: key() }),
    }),
  )
}

describe('member events on webhooks', () => {
  it('are not part of the default events, so existing receivers see only flags', async () => {
    const app = makeServer()
    const hook = await json<{ events: string[] }>(
      call(app, 'POST', '/api/v1/webhooks', { url: HOOK }),
    )
    expect(hook.events.every((e) => e.startsWith('flag.'))).toBe(true)
    await call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' })
    await settle()
    expect(deliveries).toEqual([])
  })

  it('cover the whole life of a member for a webhook that lists them', async () => {
    const app = makeServer()
    await call(app, 'POST', '/api/v1/webhooks', {
      url: HOOK,
      events: [
        'member.invited',
        'member.joined',
        'member.role_changed',
        'member.disabled',
        'member.enabled',
        'member.removed',
      ],
    })
    const { token } = await json<{ token: string }>(
      call(app, 'POST', '/api/v1/invites', { email: 'a@example.com', role: 'viewer' }),
    )
    const { user } = await acceptInvite(app, token)
    await call(app, 'PUT', `/api/v1/users/${user.id}`, { role: 'editor' })
    await call(app, 'PUT', `/api/v1/users/${user.id}`, { status: 'disabled' })
    await call(app, 'PUT', `/api/v1/users/${user.id}`, { status: 'active' })
    await call(app, 'DELETE', `/api/v1/users/${user.id}`)
    await settle()

    expect(deliveries.map((d) => d.event)).toEqual([
      'member.invited',
      'member.joined',
      'member.role_changed',
      'member.disabled',
      'member.enabled',
      'member.removed',
    ])
    expect(deliveries[0]!.body).toMatchObject({
      event: 'member.invited',
      actor: 'owner (break-glass)',
      member: { email: 'a@example.com', role: 'viewer' },
    })
    expect(deliveries[0]!.body.member).not.toHaveProperty('id')
    expect(deliveries[2]!.body).toMatchObject({
      member: { id: user.id, email: 'a@example.com', role: 'editor' },
      previous: { role: 'viewer' },
    })
    // Nothing secret travels: no link, token, or password material.
    expect(JSON.stringify(deliveries)).not.toMatch(/fh_inv_|verifier|twoFactor|salt/)
  })

  it('are refused by name when unknown', async () => {
    const app = makeServer()
    const res = await call(app, 'POST', '/api/v1/webhooks', { url: HOOK, events: ['member.hired'] })
    expect(res.status).toBe(400)
  })
})

describe('emailing invites and reset links', () => {
  function sender(fail = false) {
    const sent: EmailMessage[] = []
    return {
      sent,
      email: {
        async send(message: EmailMessage) {
          if (fail) throw new Error('provider down')
          sent.push(message)
        },
      },
    }
  }

  it('emails an invite with a link to the dashboard the admin is using', async () => {
    const { sent, email } = sender()
    const app = makeServer({ email }, { allowedOrigins: ['https://flags-ui.example.com'] })
    const res = await json<{ token: string; emailed: boolean }>(
      call(app, 'POST', '/api/v1/invites', {
        email: 'a@example.com',
        role: 'editor',
        dashboardUrl: 'https://flags-ui.example.com/',
      }),
    )
    expect(res.emailed).toBe(true)
    expect(sent).toHaveLength(1)
    const message = sent[0]!
    expect(message.to).toBe('a@example.com')
    expect(message.subject).toBe('You are invited to Flaghoist')
    const link = `https://flags-ui.example.com/#accept=${encodeURIComponent(res.token)}`
    expect(message.text).toContain(link)
    expect(message.text).toContain('owner (break-glass) invited you to Flaghoist as editor.')
    expect(message.html).toContain(link)
  })

  it('links to this server when the dashboard address is not allowed', async () => {
    const { sent, email } = sender()
    const app = makeServer({ email })
    await call(app, 'POST', '/api/v1/invites', {
      email: 'a@example.com',
      dashboardUrl: 'https://evil.example/',
    })
    expect(sent[0]!.text).toContain('http://localhost/admin/#accept=fh_inv_')
    expect(sent[0]!.text).not.toContain('evil.example')
  })

  it('escapes what goes into the HTML', () => {
    const message = inviteEmail({
      to: 'a@example.com',
      role: 'editor',
      invitedBy: '<script>alert(1)</script>@example.com',
      link: 'https://x/#accept="><img src=x>',
      expiresAt: '2026-10-01T00:00:00.000Z',
    })
    expect(message.html).not.toContain('<script>')
    expect(message.html).not.toContain('"><img')
    expect(message.html).toContain('&lt;script&gt;')
  })

  it('emails a password reset link', async () => {
    const { sent, email } = sender()
    const app = makeServer({ email })
    const { token } = await json<{ token: string }>(
      call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' }),
    )
    const { user } = await acceptInvite(app, token)
    const reset = await json<{ token: string; emailed: boolean }>(
      call(app, 'POST', `/api/v1/users/${user.id}/reset`),
    )
    expect(reset.emailed).toBe(true)
    expect(sent.at(-1)!.subject).toBe('Set a new Flaghoist password')
    expect(sent.at(-1)!.text).toContain(`#accept=${encodeURIComponent(reset.token)}`)
  })

  it('still returns the link when sending fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { email } = sender(true)
    const app = makeServer({ email })
    const res = await call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { token: string; emailed: boolean }
    expect(body.emailed).toBe(false)
    expect(body.token.startsWith('fh_inv_')).toBe(true)
  })

  it('reports emailed: false without a sender', async () => {
    const app = makeServer()
    const body = await json<{ emailed: boolean }>(
      call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' }),
    )
    expect(body.emailed).toBe(false)
  })

  it('points SSO-only invites at the sign-in screen, not a password form', async () => {
    const { sent, email } = sender()
    const app = makeServer({
      email,
      sso: {
        issuer: 'https://idp.example.com',
        clientId: 'c',
        label: 'Okta',
        defaultRole: 'viewer',
        passwordSignIn: false,
      },
    })
    await call(app, 'POST', '/api/v1/invites', { email: 'a@example.com' })
    expect(sent[0]!.text).toContain('choose Continue with Okta, signing in as a@example.com')
    expect(sent[0]!.text).not.toContain('#accept=')
  })
})
