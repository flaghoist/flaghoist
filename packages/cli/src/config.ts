import { parse } from 'smol-toml'

export type StorageKind = 'cloudflare-kv' | 'redis' | 'postgres' | 'sqlite' | 'memory'
export type AdminAuthKind = 'bearer-token' | 'oidc'
/**
 * The shape of project `flaghoist deploy`/`eject` scaffolds. `cloudflare` is a Worker plus a
 * `wrangler.toml`; `container` is a Node entry plus a `Dockerfile`, which runs on any container or
 * Node host (Render, Fly, Railway, a VPS). Cloudflare is the default, so a config written before
 * this key existed still scaffolds a Worker.
 */
export type PlatformKind = 'cloudflare' | 'container'

/** Single sign-on settings kept in `flaghoist.toml`. The client secret is never stored here. */
export interface SsoSettings {
  issuer: string
  clientId: string
  /** Members of this identity-provider group become admins. Everyone else signs in as a viewer. */
  adminGroup?: string
}

/**
 * User accounts. Only the choices live in `flaghoist.toml`; the secrets (`AUTH_PEPPER`, and
 * `SSO_CLIENT_SECRET` with SSO) come from the environment, so the file stays safe to commit.
 */
export interface AccountsSettings {
  enabled: boolean
  sso?: SsoSettings
}

export interface FlaghoistConfig {
  name: string
  storage: StorageKind
  /** Deploy shape to scaffold. Defaults to `cloudflare`. */
  platform: PlatformKind
  auth: { admin: AdminAuthKind; read: 'api-key' }
  allowedOrigins?: string[]
  /** Serve the admin dashboard at `/admin`. On by default. */
  dashboard: boolean
  /** Absent means off, so a config written before accounts existed behaves as it always did. */
  accounts?: AccountsSettings
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
  'sqlite',
  'memory',
]

/** Every deploy shape selectable by name in `flaghoist.toml`. */
export const PLATFORM_KINDS: readonly PlatformKind[] = ['cloudflare', 'container']

/** The stores a container can reach. Cloudflare KV is a Worker binding, so it is not one of them. */
export type ContainerStorage = 'postgres' | 'redis' | 'sqlite' | 'memory'

/**
 * The storage a container project uses. Cloudflare KV cannot be reached off Workers, so a config
 * that still names it (the scaffolding default) becomes postgres, the store every container deploy
 * guide uses. This is the one rule for a container's storage: the CLI reuses it to write a coherent
 * `flaghoist.toml`, and the generated entry bakes it as the `FLAGS_STORAGE` default. Every kind
 * stays overridable at runtime via the env var.
 */
export function containerStorageDefault(storage: StorageKind): ContainerStorage {
  return storage === 'cloudflare-kv' ? 'postgres' : storage
}

/**
 * Recast a config for the container platform, running its storage through the container rule so the
 * result never names a store the platform cannot use. This is the one place the platform switch
 * rewrites a config, so `init`, `create-flaghoist`, `deploy` and `eject` all stay consistent.
 */
export function asContainer(config: FlaghoistConfig): FlaghoistConfig {
  return { ...config, platform: 'container', storage: containerStorageDefault(config.storage) }
}

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
  const accounts = parseAccounts(raw.accounts)
  return {
    name,
    storage,
    platform,
    auth: { admin, read: 'api-key' },
    allowedOrigins,
    dashboard,
    ...(accounts ? { accounts } : {}),
  }
}

function parseAccounts(raw: unknown): AccountsSettings | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const table = raw as Record<string, unknown>
  const enabled = table.enabled === true
  const ssoRaw =
    typeof table.sso === 'object' && table.sso !== null
      ? (table.sso as Record<string, unknown>)
      : null
  const sso =
    ssoRaw && typeof ssoRaw.issuer === 'string' && typeof ssoRaw.clientId === 'string'
      ? {
          issuer: ssoRaw.issuer,
          clientId: ssoRaw.clientId,
          ...(typeof ssoRaw.adminGroup === 'string' && ssoRaw.adminGroup
            ? { adminGroup: ssoRaw.adminGroup }
            : {}),
        }
      : undefined
  return { enabled, ...(sso ? { sso } : {}) }
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
  if (config.accounts) {
    lines.push(
      '',
      '# Accounts read AUTH_PEPPER from the environment. Never put it in this file.',
      '[accounts]',
      `enabled = ${config.accounts.enabled}`,
    )
    const sso = config.accounts.sso
    if (sso) {
      lines.push(
        '',
        '# The client secret comes from SSO_CLIENT_SECRET in the environment.',
        '[accounts.sso]',
        `issuer = ${JSON.stringify(sso.issuer)}`,
        `clientId = ${JSON.stringify(sso.clientId)}`,
      )
      if (sso.adminGroup) lines.push(`adminGroup = ${JSON.stringify(sso.adminGroup)}`)
    }
  }
  return `${lines.join('\n')}\n`
}
