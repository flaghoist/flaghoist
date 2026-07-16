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
  save(key: string, input: FlagInput): Promise<FeatureFlag>
  remove(key: string): Promise<void>
}

export function createApi(url: string, token: string): Api {
  const base = url.replace(/\/+$/, '')
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(base + path, { ...init, headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ApiError(res.status, text || res.statusText)
    }
    return res
  }

  return {
    async list() {
      const body = (await (await request('/flags')).json()) as { flags: FeatureFlag[] }
      return body.flags
    },
    async save(key, input) {
      const res = await request(`/flags/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })
      return (await res.json()) as FeatureFlag
    },
    async remove(key) {
      await request(`/flags/${encodeURIComponent(key)}`, { method: 'DELETE' })
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
