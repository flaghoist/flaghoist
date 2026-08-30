import {
  asContainer,
  DEFAULT_CONFIG,
  PLATFORM_KINDS,
  serializeConfig,
  STORAGE_KINDS,
  type FlaghoistConfig,
  type PlatformKind,
  type StorageKind,
} from 'flaghoist'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface ScaffoldOptions {
  /** Directory to create. Omitted means "scaffold into the current directory". */
  directory?: string
  storage?: string
  /** Deploy shape: `cloudflare` (a Worker, the default) or `container`. */
  platform?: string
  /** Overridable so tests can scaffold into a temp dir. */
  cwd?: string
}

export interface ScaffoldResult {
  /** Absolute path of the directory the project was written to. */
  dir: string
  /** Absolute path of the written `flaghoist.toml`. */
  configPath: string
  /** True when we created the directory, false when we wrote into an existing one. */
  createdDirectory: boolean
  config: FlaghoistConfig
}

/**
 * Write a new `flaghoist.toml` project. The config is serialized with the CLI's own
 * `serializeConfig`, so what we scaffold is by construction something `flaghoist` can parse back.
 */
export function scaffold(options: ScaffoldOptions = {}): ScaffoldResult {
  const root = options.cwd ?? process.cwd()

  if (options.storage && !STORAGE_KINDS.includes(options.storage as StorageKind)) {
    throw new Error(`Unknown storage "${options.storage}". One of: ${STORAGE_KINDS.join(', ')}.`)
  }
  if (options.platform && !PLATFORM_KINDS.includes(options.platform as PlatformKind)) {
    throw new Error(`Unknown platform "${options.platform}". One of: ${PLATFORM_KINDS.join(', ')}.`)
  }

  const dir = options.directory ? resolve(root, options.directory) : resolve(root)
  const existed = existsSync(dir)

  // Refuse to scaffold over someone's work. An empty directory is fine — people often `mkdir`
  // first out of habit — but anything with files in it is theirs, not ours.
  if (existed && readdirSync(dir).length > 0) {
    throw new Error(
      options.directory
        ? `Directory "${options.directory}" already exists and is not empty.`
        : 'The current directory is not empty. Pass a directory name, e.g. `npm create flaghoist team-flags`.',
    )
  }
  if (!existed) mkdirSync(dir, { recursive: true })

  const base: FlaghoistConfig = {
    ...DEFAULT_CONFIG,
    // The directory name is the natural project name; falling back keeps `.` usable.
    name: options.directory ?? DEFAULT_CONFIG.name,
    storage: (options.storage as StorageKind) ?? DEFAULT_CONFIG.storage,
  }
  // asContainer runs the storage through the container rule, so a container project never lands with
  // a KV choice it cannot use.
  const config = options.platform === 'container' ? asContainer(base) : base

  const configPath = join(dir, 'flaghoist.toml')
  writeFileSync(configPath, serializeConfig(config))

  return { dir, configPath, createdDirectory: !existed, config }
}
