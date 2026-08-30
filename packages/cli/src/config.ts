import { parse } from 'smol-toml'

export type StorageKind = 'cloudflare-kv' | 'redis' | 'postgres' | 'memory'
export type AdminAuthKind = 'bearer-token' | 'oidc'
/**
 * The shape of project `flaghoist deploy`/`eject` scaffolds. `cloudflare` is a Worker plus a
 * `wrangler.toml`; `container` is a Node entry plus a `Dockerfile`, which runs on any container or
 * Node host (Render, Fly, Railway, a VPS). Cloudflare is the default, so a config written before
 * this key existed still scaffolds a Worker.
 */
export type PlatformKind = 'cloudflare' | 'container'

export interface FlaghoistConfig {
  name: string
  storage: StorageKind
  /** Deploy shape to scaffold. Defaults to `cloudflare`. */
  platform: PlatformKind
  auth: { admin: AdminAuthKind; read: 'api-key' }
  allowedOrigins?: string[]
  /** Serve the admin dashboard at `/admin`. On by default. */
  dashboard: boolean
}

export const DEFAULT_CONFIG: FlaghoistConfig = {
  name: 'team-flags',
  storage: 'cloudflare-kv',
  platform: 'cloudflare',
  auth: { admin: 'bearer-token', read: 'api-key' },
  dashboard: true,
}

/** Every storage backend selectable by name in `flaghoist.toml`. */
export const STORAGE_KINDS: readonly StorageKind[] = [
  'cloudflare-kv',
  'redis',
  'postgres',
  'memory',
]

/** Every deploy shape selectable by name in `flaghoist.toml`. */
export const PLATFORM_KINDS: readonly PlatformKind[] = ['cloudflare', 'container']

/** Parse a `flaghoist.toml` into a validated config, falling back to defaults for unknown values. */
export function parseConfig(text: string): FlaghoistConfig {
  const raw = parse(text) as Record<string, unknown>
  const name = typeof raw.name === 'string' && raw.name ? raw.name : DEFAULT_CONFIG.name
  const storage = STORAGE_KINDS.includes(raw.storage as StorageKind)
    ? (raw.storage as StorageKind)
    : DEFAULT_CONFIG.storage
  // Only an explicit, known platform opts out of Cloudflare, so a config written before the key
  // existed (or carrying a typo) still scaffolds a Worker, which is the documented default.
  const platform: PlatformKind =
    raw.platform === 'container' ? 'container' : DEFAULT_CONFIG.platform
  const authRaw =
    typeof raw.auth === 'object' && raw.auth !== null ? (raw.auth as Record<string, unknown>) : {}
  const admin: AdminAuthKind = authRaw.admin === 'oidc' ? 'oidc' : 'bearer-token'
  const allowedOrigins = Array.isArray(raw.allowedOrigins)
    ? raw.allowedOrigins.filter((x): x is string => typeof x === 'string')
    : undefined
  // Only an explicit `false` opts out, so configs written before the key existed keep the
  // dashboard, which is the documented behaviour.
  const dashboard = raw.dashboard !== false
  return { name, storage, platform, auth: { admin, read: 'api-key' }, allowedOrigins, dashboard }
}

/** Render a config back to `flaghoist.toml` text. */
export function serializeConfig(config: FlaghoistConfig): string {
  // Top-level keys must precede any [table] header in TOML, so allowedOrigins comes before [auth].
  const lines = [
    `name = ${JSON.stringify(config.name)}`,
    `storage = ${JSON.stringify(config.storage)}`,
  ]
  // Cloudflare is the default and the absent-key meaning, so only a container project writes the
  // key. This keeps a Worker config byte-identical to what earlier versions produced.
  if (config.platform !== 'cloudflare') {
    lines.push(`platform = ${JSON.stringify(config.platform)}`)
  }
  if (config.allowedOrigins && config.allowedOrigins.length > 0) {
    lines.push(`allowedOrigins = ${JSON.stringify(config.allowedOrigins)}`)
  }
  if (!config.dashboard) {
    lines.push('dashboard = false')
  }
  lines.push(
    '',
    '[auth]',
    `admin = ${JSON.stringify(config.auth.admin)}`,
    `read = ${JSON.stringify(config.auth.read)}`,
  )
  return `${lines.join('\n')}\n`
}
