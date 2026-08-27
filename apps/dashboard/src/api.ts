export interface Condition {
  attribute: string
  operator: string
  value: string | number | boolean | Array<string | number>
}

export interface TargetingRule {
  description?: string
  conditions: Condition[]
  result: { enabled: boolean; rollout?: { percentage: number } }
}

export interface FlagMetadata {
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

export interface FeatureFlag {
  key: string
  enabled: boolean
  rollout: { percentage: number }
  rules?: TargetingRule[]
  description: string
  metadata: FlagMetadata
}

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
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface Api {
  list(): Promise<FeatureFlag[]>
  /**
   * Write a flag. Pass `ifMatch` (a flag's `flagEtag`) to make the write conditional: the server
   * rejects it with a `409`-like `ApiError` (HTTP 412) if the flag changed since it was loaded,
   * rather than silently clobbering another edit. Omit it to force the write.
   */
  save(key: string, input: FlagInput, ifMatch?: string): Promise<FeatureFlag>
  remove(key: string): Promise<void>
}

/** The ETag for a flag, matching the server's, for optimistic-concurrency writes via `If-Match`. */
export function flagEtag(flag: FeatureFlag): string {
  return `"${flag.metadata.updatedAt}"`
}

const DEFAULT_TIMEOUT_MS = 15000

/** Runtime check for the fields the UI relies on — guards against a malformed response. */
function isFeatureFlag(v: unknown): v is FeatureFlag {
  if (!v || typeof v !== 'object') return false
  const f = v as Record<string, unknown>
  const rollout = f.rollout as Record<string, unknown> | undefined
  return (
    typeof f.key === 'string' &&
    typeof f.enabled === 'boolean' &&
    typeof rollout?.percentage === 'number' &&
    typeof f.metadata === 'object' &&
    f.metadata !== null
  )
}

/** Parse a response body as JSON, turning a non-JSON body into a clean ApiError. */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    throw new ApiError(502, 'The server returned a response that was not valid JSON.')
  }
}

/**
 * Pull the server's own explanation out of a failed response. The API answers errors as
 * `{ error: "..." }`, and showing that beats showing a bare status line the operator cannot act on.
 * Falls back through raw text to the status text when the body is not the shape we expect.
 */
async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown }
      const detail = body?.error ?? body?.message
      if (typeof detail === 'string' && detail.trim()) return detail.trim()
    } catch {
      /* not JSON: the raw text is still better than nothing */
    }
    return text.slice(0, 300)
  }
  return res.statusText || 'Request failed.'
}

export function createApi(url: string, token: string, timeoutMs = DEFAULT_TIMEOUT_MS): Api {
  const base = url.replace(/\/+$/, '')
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }

  async function request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetch(base + path, {
        ...init,
        // Per-request headers (for example If-Match) layer over the base auth headers.
        headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      // Every failure leaves here as an ApiError, so callers have exactly one error shape to
      // handle. Previously a timeout became an ApiError while DNS, refused-connection and CORS
      // failures escaped as raw TypeErrors, and callers quietly handled only the first kind.
      if (
        err instanceof DOMException &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        throw new ApiError(408, `Request timed out after ${Math.round(timeoutMs / 1000)}s.`)
      }
      throw new ApiError(0, 'Could not reach the server. Check the URL and its CORS allowlist.')
    }
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
    return res
  }

  return {
    async list() {
      const body = await readJson(await request('/api/v1/flags'))
      const flags = (body as { flags?: unknown } | null)?.flags
      if (!Array.isArray(flags)) {
        throw new ApiError(502, 'Unexpected response: the flag list was missing or malformed.')
      }
      return flags.filter(isFeatureFlag)
    },
    async save(key, input, ifMatch) {
      const body = await readJson(
        await request(`/api/v1/flags/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: JSON.stringify(input),
          headers: ifMatch ? { 'If-Match': ifMatch } : undefined,
        }),
      )
      if (!isFeatureFlag(body)) {
        throw new ApiError(502, 'Unexpected response: the saved flag was malformed.')
      }
      return body
    },
    async remove(key) {
      await request(`/api/v1/flags/${encodeURIComponent(key)}`, { method: 'DELETE' })
    },
  }
}

/** The human-readable state of a flag, matching how it will evaluate. */
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
