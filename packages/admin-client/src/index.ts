import type { FeatureFlag, TargetingRule, WebhookEndpoint, WebhookEvent } from '@flaghoist/core'

export type {
  Condition,
  FeatureFlag,
  FlagMetadata,
  Operator,
  TargetingRule,
  WebhookEndpoint,
  WebhookEvent,
} from '@flaghoist/core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlagInput {
  enabled: boolean
  rollout: { percentage: number }
  rules?: TargetingRule[]
  description?: string
}

export const OPERATORS = [
  'eq',
  'neq',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'endsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'semverGte',
  'semverLt',
] as const

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AdminClientOptions {
  url: string
  token: string
  /**
   * Which environment admin requests target, sent as `X-Flaghoist-Environment` on every request.
   * Omit for a server with no environments configured, or to use its default environment.
   */
  environment?: string
  /** Injectable fetch for tests -- drives an in-process server with no network. */
  fetch?: FetchLike
  /** Request timeout in ms. Ignored when `fetch` is injected. Default: 15000. */
  timeoutMs?: number
}

export interface PutOptions {
  ifMatch?: string
  changeDescription?: string
}

export interface ListOptions {
  includeArchived?: boolean
}

export interface ExportPayload {
  version: number
  exportedAt: string
  flags: ExportedFlag[]
}

export interface ExportedFlag {
  key: string
  enabled: boolean
  rollout: { percentage: number }
  description?: string
  rules?: TargetingRule[]
}

export interface ImportResult {
  created: number
  updated: number
  errors: { key: string; error: string }[]
}

export interface WebhookInput {
  url: string
  events?: WebhookEvent[]
  enabled?: boolean
}

export interface WebhookTestResult {
  status: number
  ok: boolean
  error?: string
}

export interface EnvironmentsResult {
  environments: string[]
  default: string
}

export interface AdminClient {
  list(options?: ListOptions): Promise<FeatureFlag[]>
  get(key: string): Promise<FeatureFlag | null>
  /** `ifMatch` is an ETag from `flagEtag()`. The server rejects with 412 if the flag changed. */
  put(key: string, input: FlagInput, ifMatchOrOptions?: string | PutOptions): Promise<FeatureFlag>
  delete(key: string): Promise<void>
  archive(key: string): Promise<FeatureFlag>
  restore(key: string): Promise<FeatureFlag>
  exportFlags(): Promise<ExportPayload>
  importFlags(payload: ExportPayload): Promise<ImportResult>
  listWebhooks(): Promise<WebhookEndpoint[]>
  createWebhook(input: WebhookInput): Promise<WebhookEndpoint>
  updateWebhook(id: string, input: Partial<WebhookInput>): Promise<WebhookEndpoint>
  deleteWebhook(id: string): Promise<void>
  testWebhook(id: string): Promise<WebhookTestResult>
  /** The server's configured environments and its default. Always returns at least one. */
  listEnvironments(): Promise<EnvironmentsResult>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000

function isFeatureFlag(v: unknown): v is FeatureFlag {
  if (!v || typeof v !== 'object') return false
  const f = v as Record<string, unknown>
  const rollout = f['rollout'] as Record<string, unknown> | undefined
  return (
    typeof f['key'] === 'string' &&
    typeof f['enabled'] === 'boolean' &&
    typeof rollout?.['percentage'] === 'number' &&
    typeof f['metadata'] === 'object' &&
    f['metadata'] !== null
  )
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    throw new ApiError(502, 'The server returned a response that was not valid JSON.')
  }
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown }
      const detail = body?.error ?? body?.message
      if (typeof detail === 'string' && detail.trim()) return detail.trim()
    } catch {
      /* not JSON -- fall through to raw text */
    }
    return text.slice(0, 300)
  }
  return res.statusText || 'Request failed.'
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function createAdminClient(options: AdminClientOptions): AdminClient {
  const base = options.url.replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const baseHeaders: Record<string, string> = {
    authorization: `Bearer ${options.token}`,
    'content-type': 'application/json',
  }
  if (options.environment) {
    baseHeaders['x-flaghoist-environment'] = options.environment
  }

  async function request(
    path: string,
    init?: RequestInit,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const merged: RequestInit = { ...init, headers: { ...baseHeaders, ...extraHeaders } }
    let res: Response
    if (options.fetch) {
      res = await options.fetch(base + path, merged)
    } else {
      try {
        res = await fetch(base + path, { ...merged, signal: AbortSignal.timeout(timeoutMs) })
      } catch (err) {
        if (
          err instanceof DOMException &&
          (err.name === 'TimeoutError' || err.name === 'AbortError')
        ) {
          throw new ApiError(408, `Request timed out after ${Math.round(timeoutMs / 1000)}s.`)
        }
        throw new ApiError(0, 'Could not reach the server. Check the URL and its CORS allowlist.')
      }
    }
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
    return res
  }

  return {
    async list(options) {
      const qs = options?.includeArchived ? '?includeArchived=true' : ''
      const body = await readJson(await request(`/api/v1/flags${qs}`))
      const flags = (body as { flags?: unknown } | null)?.flags
      if (!Array.isArray(flags)) {
        throw new ApiError(502, 'Unexpected response: the flag list was missing or malformed.')
      }
      return flags.filter(isFeatureFlag)
    },

    async get(key) {
      try {
        const res = await request(`/api/v1/flags/${encodeURIComponent(key)}`)
        const body = await readJson(res)
        return isFeatureFlag(body) ? body : null
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },

    async put(key, input, ifMatchOrOptions) {
      const opts: PutOptions =
        typeof ifMatchOrOptions === 'string'
          ? { ifMatch: ifMatchOrOptions }
          : (ifMatchOrOptions ?? {})
      const extra = opts.ifMatch ? { 'if-match': opts.ifMatch } : undefined
      const payload = opts.changeDescription
        ? { ...input, changeDescription: opts.changeDescription }
        : input
      const body = await readJson(
        await request(
          `/api/v1/flags/${encodeURIComponent(key)}`,
          { method: 'PUT', body: JSON.stringify(payload) },
          extra,
        ),
      )
      if (!isFeatureFlag(body)) {
        throw new ApiError(502, 'Unexpected response: the saved flag was malformed.')
      }
      return body
    },

    async delete(key) {
      await request(`/api/v1/flags/${encodeURIComponent(key)}`, { method: 'DELETE' })
    },

    async archive(key) {
      const body = await readJson(
        await request(`/api/v1/flags/${encodeURIComponent(key)}/archive`, { method: 'POST' }),
      )
      if (!isFeatureFlag(body)) {
        throw new ApiError(502, 'Unexpected response: the archived flag was malformed.')
      }
      return body
    },

    async restore(key) {
      const body = await readJson(
        await request(`/api/v1/flags/${encodeURIComponent(key)}/restore`, { method: 'POST' }),
      )
      if (!isFeatureFlag(body)) {
        throw new ApiError(502, 'Unexpected response: the restored flag was malformed.')
      }
      return body
    },

    async exportFlags() {
      const body = await readJson(await request('/api/v1/export'))
      return body as ExportPayload
    },

    async importFlags(payload) {
      const body = await readJson(
        await request('/api/v1/import', {
          method: 'POST',
          body: JSON.stringify({ version: payload.version, flags: payload.flags }),
        }),
      )
      return body as ImportResult
    },

    async listWebhooks() {
      const body = await readJson(await request('/api/v1/webhooks'))
      const hooks = (body as { webhooks?: unknown } | null)?.webhooks
      if (!Array.isArray(hooks)) {
        throw new ApiError(502, 'Unexpected response: the webhook list was missing or malformed.')
      }
      return hooks as WebhookEndpoint[]
    },

    async createWebhook(input) {
      const body = await readJson(
        await request('/api/v1/webhooks', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      )
      return body as WebhookEndpoint
    },

    async updateWebhook(id, input) {
      const body = await readJson(
        await request(`/api/v1/webhooks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(input),
        }),
      )
      return body as WebhookEndpoint
    },

    async deleteWebhook(id) {
      await request(`/api/v1/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async testWebhook(id) {
      const body = await readJson(
        await request(`/api/v1/webhooks/${encodeURIComponent(id)}/test`, { method: 'POST' }),
      )
      return body as WebhookTestResult
    },

    async listEnvironments() {
      const body = await readJson(await request('/api/v1/environments'))
      return body as EnvironmentsResult
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ETag for a flag, for use with the `ifMatch` parameter of `put()`. */
export function flagEtag(flag: FeatureFlag): string {
  return `"${flag.metadata.updatedAt}"`
}

/** Human-readable enabled state of a flag. */
export function flagState(flag: FeatureFlag): {
  label: string
  kind: 'on' | 'off' | 'split' | 'disabled'
} {
  if (!flag.enabled) return { label: 'disabled', kind: 'disabled' }
  const pct = flag.rollout.percentage
  if (pct >= 100) return { label: 'on', kind: 'on' }
  if (pct <= 0) return { label: 'off', kind: 'off' }
  return { label: `${pct}%`, kind: 'split' }
}

function requireFlag(flag: FeatureFlag | null, key: string): FeatureFlag {
  if (!flag) throw new Error(`Flag "${key}" not found`)
  return flag
}

export function createFlag(
  client: AdminClient,
  key: string,
  opts: { enabled?: boolean; percentage?: number; description?: string },
): Promise<FeatureFlag> {
  return client.put(key, {
    enabled: opts.enabled ?? false,
    rollout: { percentage: opts.percentage ?? 0 },
    rules: [],
    description: opts.description ?? '',
  })
}

export async function toggleFlag(
  client: AdminClient,
  key: string,
  to: boolean | 'flip',
): Promise<FeatureFlag> {
  const flag = requireFlag(await client.get(key), key)
  const enabled = to === 'flip' ? !flag.enabled : to
  return client.put(key, {
    enabled,
    rollout: flag.rollout,
    rules: flag.rules,
    description: flag.description,
  })
}

export async function setRollout(
  client: AdminClient,
  key: string,
  percentage: number,
): Promise<FeatureFlag> {
  const flag = requireFlag(await client.get(key), key)
  return client.put(key, {
    enabled: flag.enabled,
    rollout: { percentage },
    rules: flag.rules,
    description: flag.description,
  })
}

export async function setRules(
  client: AdminClient,
  key: string,
  rules: TargetingRule[],
): Promise<FeatureFlag> {
  const flag = requireFlag(await client.get(key), key)
  return client.put(key, {
    enabled: flag.enabled,
    rollout: flag.rollout,
    rules,
    description: flag.description,
  })
}
