import { parse } from 'smol-toml'

export type StorageKind = 'cloudflare-kv' | 'redis' | 'postgres' | 'memory'
export type AdminAuthKind = 'bearer-token' | 'oidc'

export interface FlaghoistConfig {
  name: string
  storage: StorageKind
  auth: { admin: AdminAuthKind; read: 'api-key' }
  allowedOrigins?: string[]
}

export const DEFAULT_CONFIG: FlaghoistConfig = {
  name: 'team-flags',
  storage: 'cloudflare-kv',
  auth: { admin: 'bearer-token', read: 'api-key' },
}

/** Every storage backend selectable by name in `flaghoist.toml`. */
export const STORAGE_KINDS: readonly StorageKind[] = [
  'cloudflare-kv',
  'redis',
  'postgres',
  'memory',
]

/** Parse a `flaghoist.toml` into a validated config, falling back to defaults for unknown values. */
export function parseConfig(text: string): FlaghoistConfig {
  const raw = parse(text) as Record<string, unknown>
  const name = typeof raw.name === 'string' && raw.name ? raw.name : DEFAULT_CONFIG.name
  const storage = STORAGE_KINDS.includes(raw.storage as StorageKind)
    ? (raw.storage as StorageKind)
    : DEFAULT_CONFIG.storage
  const authRaw =
    typeof raw.auth === 'object' && raw.auth !== null ? (raw.auth as Record<string, unknown>) : {}
  const admin: AdminAuthKind = authRaw.admin === 'oidc' ? 'oidc' : 'bearer-token'
  const allowedOrigins = Array.isArray(raw.allowedOrigins)
    ? raw.allowedOrigins.filter((x): x is string => typeof x === 'string')
    : undefined
  return { name, storage, auth: { admin, read: 'api-key' }, allowedOrigins }
}

/** Render a config back to `flaghoist.toml` text. */
export function serializeConfig(config: FlaghoistConfig): string {
  // Top-level keys must precede any [table] header in TOML, so allowedOrigins comes before [auth].
  const lines = [
    `name = ${JSON.stringify(config.name)}`,
    `storage = ${JSON.stringify(config.storage)}`,
  ]
  if (config.allowedOrigins && config.allowedOrigins.length > 0) {
    lines.push(`allowedOrigins = ${JSON.stringify(config.allowedOrigins)}`)
  }
  lines.push(
    '',
    '[auth]',
    `admin = ${JSON.stringify(config.auth.admin)}`,
    `read = ${JSON.stringify(config.auth.read)}`,
  )
  return `${lines.join('\n')}\n`
}
