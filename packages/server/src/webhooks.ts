import type { FlagSnapshot, StorageAdapter, WebhookEndpoint, WebhookEvent } from '@flaghoist/core'
import { WEBHOOK_EVENTS } from '@flaghoist/core'

// ---------------------------------------------------------------------------
// Webhook store (persistent when the adapter supports it, in-memory otherwise)
// ---------------------------------------------------------------------------

export interface WebhookStore {
  list(): Promise<WebhookEndpoint[]>
  get(id: string): Promise<WebhookEndpoint | null>
  put(id: string, webhook: WebhookEndpoint): Promise<void>
  delete(id: string): Promise<void>
}

export function createWebhookStore(storage?: StorageAdapter | null): WebhookStore {
  if (
    storage?.putWebhook &&
    storage?.getWebhook &&
    storage?.deleteWebhook &&
    storage?.listWebhooks
  ) {
    return {
      list: () => storage.listWebhooks!(),
      get: (id) => storage.getWebhook!(id),
      put: (id, w) => storage.putWebhook!(id, w),
      delete: (id) => storage.deleteWebhook!(id),
    }
  }

  const mem = new Map<string, WebhookEndpoint>()
  return {
    async list() {
      return [...mem.values()]
    },
    async get(id) {
      return mem.get(id) ?? null
    },
    async put(id, w) {
      mem.set(id, w)
    },
    async delete(id) {
      mem.delete(id)
    },
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface WebhookInput {
  url: string
  events?: WebhookEvent[]
  enabled?: boolean
}

const URL_MAX = 2048

export function validateWebhookInput(
  input: unknown,
): { ok: true; value: WebhookInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Expected an object' }
  const obj = input as Record<string, unknown>

  if (typeof obj.url !== 'string' || !obj.url.trim()) {
    return { ok: false, error: 'url is required' }
  }
  const url = obj.url.trim()
  if (url.length > URL_MAX) return { ok: false, error: `url must be at most ${URL_MAX} characters` }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: 'url is not a valid URL' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'url must use http or https' }
  }

  let events: WebhookEvent[] | undefined
  if (obj.events !== undefined) {
    if (!Array.isArray(obj.events)) return { ok: false, error: 'events must be an array' }
    for (const e of obj.events) {
      if (!WEBHOOK_EVENTS.includes(e as WebhookEvent)) {
        return { ok: false, error: `Unknown event: ${String(e)}` }
      }
    }
    events = obj.events as WebhookEvent[]
  }

  let enabled: boolean | undefined
  if (obj.enabled !== undefined) {
    if (typeof obj.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean' }
    enabled = obj.enabled
  }

  return { ok: true, value: { url, events, enabled } }
}

// ---------------------------------------------------------------------------
// HMAC signing
// ---------------------------------------------------------------------------

export async function sign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256=${hex}`
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  flag: {
    key: string
    enabled: boolean
    rollout: { percentage: number }
    description: string
  }
  actor: string
  previous?: FlagSnapshot
}

export async function dispatchWebhooks(
  store: WebhookStore,
  event: WebhookEvent,
  payload: WebhookPayload,
): Promise<void> {
  const hooks = await store.list()
  const active = hooks.filter((h) => h.enabled && h.events.includes(event))
  if (active.length === 0) return

  const body = JSON.stringify(payload)

  const deliveries = active.map(async (hook) => {
    try {
      const signature = await sign(hook.secret, body)
      await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Flaghoist-Event': event,
          'X-Flaghoist-Signature': signature,
          'X-Flaghoist-Webhook-Id': hook.id,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      // fire-and-forget: log failures but do not block the caller
    }
  })

  await Promise.allSettled(deliveries)
}

// ---------------------------------------------------------------------------
// ID + secret generation
// ---------------------------------------------------------------------------

export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
