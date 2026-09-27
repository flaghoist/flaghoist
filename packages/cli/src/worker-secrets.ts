import type { FlaghoistConfig } from './config'

/** Runs a wrangler command. Injected so tests can check what would be sent without a real account. */
export type WranglerRunner = (
  args: string[],
  input?: string,
) => { status: number | null; stdout: string }

/** The Worker secrets a config needs: the accounts pepper, and the SSO client secret with SSO. */
export function requiredSecrets(config: FlaghoistConfig): string[] {
  if (!config.accounts?.enabled) return []
  return ['AUTH_PEPPER', ...(config.accounts.sso ? ['SSO_CLIENT_SECRET'] : [])]
}

/** Secret names in `wrangler secret list` output, which is JSON: `[{ "name": "X", ... }]`. */
export function parseSecretNames(output: string): Set<string> | null {
  try {
    const start = output.indexOf('[')
    const parsed = JSON.parse(output.slice(start)) as { name?: unknown }[]
    return new Set(parsed.map((s) => s.name).filter((n): n is string => typeof n === 'string'))
  } catch {
    return null
  }
}

/**
 * Give the Worker the secrets it needs from `.env`. A secret the Worker already has is never
 * replaced: swapping the pepper under a live server would break every password. When wrangler cannot
 * say which secrets exist, nothing is written and the person is told how to do it themselves.
 */
export function syncWorkerSecrets(
  config: FlaghoistConfig,
  env: Record<string, string>,
  run: WranglerRunner,
  log: (line: string) => void,
): { set: string[]; missing: string[] } {
  const needed = requiredSecrets(config)
  if (needed.length === 0) return { set: [], missing: [] }

  const listed = run(['secret', 'list'])
  const existing = listed.status === 0 ? parseSecretNames(listed.stdout) : null
  if (!existing) {
    log('Could not list the Worker secrets, so none were changed. Set them yourself:')
    for (const name of needed) log(`  npx wrangler secret put ${name}`)
    return { set: [], missing: needed }
  }

  const set: string[] = []
  const missing: string[] = []
  for (const name of needed) {
    if (existing.has(name)) continue
    const value = env[name]
    if (!value) {
      missing.push(name)
      continue
    }
    const result = run(['secret', 'put', name], value)
    if (result.status === 0) set.push(name)
    else missing.push(name)
  }

  if (set.length > 0) log(`Set ${set.join(' and ')} on the Worker from .env.`)
  for (const name of missing) {
    log(
      name === 'AUTH_PEPPER'
        ? 'AUTH_PEPPER is not set, so accounts cannot sign in yet. Set it with:'
        : `${name} is not set. Set it with:`,
    )
    log(`  npx wrangler secret put ${name}`)
  }
  return { set, missing }
}
