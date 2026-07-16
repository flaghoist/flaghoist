import type { FeatureFlag } from '@flaghoist/core'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AdminClientOptions {
  url: string
  token: string
  /** Injectable fetch (defaults to global fetch) — used to drive an in-process server in tests. */
  fetch?: FetchLike
}

export interface FlagInput {
  enabled: boolean
  rollout: { percentage: number }
  rules?: unknown[]
  description?: string
}

export interface AdminClient {
  list(): Promise<FeatureFlag[]>
  get(key: string): Promise<FeatureFlag | null>
  put(key: string, input: FlagInput): Promise<FeatureFlag>
  delete(key: string): Promise<void>
}

export function createAdminClient(options: AdminClientOptions): AdminClient {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init))
  const base = options.url.replace(/\/+$/, '')
  const headers = {
    authorization: `Bearer ${options.token}`,
    'content-type': 'application/json',
  }
  const path = (key: string) => `${base}/flags/${encodeURIComponent(key)}`

  return {
    async list() {
      const res = await doFetch(`${base}/flags`, { headers })
      if (!res.ok) throw new Error(`Failed to list flags (${res.status})`)
      return ((await res.json()) as { flags: FeatureFlag[] }).flags
    },
    async get(key) {
      const res = await doFetch(path(key), { headers })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Failed to read flag "${key}" (${res.status})`)
      return (await res.json()) as FeatureFlag
    },
    async put(key, input) {
      const res = await doFetch(path(key), { method: 'PUT', headers, body: JSON.stringify(input) })
      if (!res.ok)
        throw new Error(`Failed to save flag "${key}" (${res.status}): ${await res.text()}`)
      return (await res.json()) as FeatureFlag
    },
    async delete(key) {
      const res = await doFetch(path(key), { method: 'DELETE', headers })
      if (!res.ok && res.status !== 404)
        throw new Error(`Failed to delete flag "${key}" (${res.status})`)
    },
  }
}

function requireFlag(flag: FeatureFlag | null, key: string): FeatureFlag {
  if (!flag) throw new Error(`Flag "${key}" not found`)
  return flag
}

/** Create (or overwrite) a flag with initial state. */
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

/**
 * Toggle a flag on/off (or flip it). The server's PUT is a full replace, so we read the current
 * flag and re-send everything else unchanged.
 */
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

/** Set a flag's rollout percentage, preserving everything else. */
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

/** Replace a flag's targeting rules, preserving everything else. */
export async function setRules(
  client: AdminClient,
  key: string,
  rules: unknown[],
): Promise<FeatureFlag> {
  const flag = requireFlag(await client.get(key), key)
  return client.put(key, {
    enabled: flag.enabled,
    rollout: flag.rollout,
    rules,
    description: flag.description,
  })
}
