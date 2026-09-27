import {
  collectSetup,
  defaultsAsker,
  PLATFORM_KINDS,
  STORAGE_KINDS,
  writeSetup,
  type Asker,
  type FlaghoistConfig,
  type PlatformKind,
  type SetupPreset,
  type SetupResult,
  type StorageKind,
} from 'flaghoist'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

export interface ScaffoldOptions extends Omit<SetupPreset, 'storage' | 'platform'> {
  /** Directory to create. Omitted means "scaffold into the current directory". */
  directory?: string
  storage?: string
  /** Deploy shape: `cloudflare` (a Worker, the default) or `container`. */
  platform?: string
  /** Who answers the questions the options leave open. Defaults to taking every default. */
  asker?: Asker
  /** Overridable so tests can scaffold into a temp dir. */
  cwd?: string
}

export interface ScaffoldResult {
  /** Absolute path of the directory the project was written to. */
  dir: string
  /** Absolute path of the written `flaghoist.toml`. */
  configPath: string
  /** Absolute path of the written `.env`, when there were secrets to keep. */
  envPath?: string
  /** True when we created the directory, false when we wrote into an existing one. */
  createdDirectory: boolean
  config: FlaghoistConfig
  setup: SetupResult
}

/**
 * Write a new project: ask what the options leave open, then write `flaghoist.toml` with the CLI's
 * own serializer (so it is by construction something `flaghoist` can parse back), and a git-ignored
 * `.env` for any secrets.
 */
export async function scaffold(options: ScaffoldOptions = {}): Promise<ScaffoldResult> {
  const root = options.cwd ?? process.cwd()

  if (options.storage && !STORAGE_KINDS.includes(options.storage as StorageKind)) {
    throw new Error(`Unknown storage "${options.storage}". One of: ${STORAGE_KINDS.join(', ')}.`)
  }
  if (options.platform && !PLATFORM_KINDS.includes(options.platform as PlatformKind)) {
    throw new Error(`Unknown platform "${options.platform}". One of: ${PLATFORM_KINDS.join(', ')}.`)
  }

  // Refuse a non-empty target before asking anything, so nobody answers questions for nothing.
  if (options.directory) assertUsable(resolve(root, options.directory), options.directory)
  else if (!options.asker?.interactive) assertUsable(resolve(root), undefined)

  const { directory, cwd: _cwd, asker, storage, platform, ...rest } = options
  const preset: SetupPreset = {
    ...rest,
    storage: storage as StorageKind | undefined,
    platform: platform as PlatformKind | undefined,
    // The directory name is the natural project name.
    name: rest.name ?? (directory ? basename(directory) : undefined),
  }
  const setup = await collectSetup(asker ?? defaultsAsker(), preset)

  // An interactive run without a directory scaffolds into a new one named after the project.
  const target =
    directory ?? (asker?.interactive === false || !asker ? undefined : setup.config.name)
  const dir = target ? resolve(root, target) : resolve(root)
  assertUsable(dir, target)
  const existed = existsSync(dir)
  if (!existed) mkdirSync(dir, { recursive: true })

  const { envPath } = writeSetup(dir, setup)
  return {
    dir,
    configPath: join(dir, 'flaghoist.toml'),
    ...(envPath ? { envPath } : {}),
    createdDirectory: !existed,
    config: setup.config,
    setup,
  }
}

/**
 * An empty directory is fine (people often `mkdir` first out of habit), but anything with files in
 * it is theirs, not ours.
 */
function assertUsable(dir: string, shown: string | undefined): void {
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(
      shown
        ? `Directory "${shown}" already exists and is not empty.`
        : 'The current directory is not empty. Pass a directory name, e.g. `npm create flaghoist team-flags`.',
    )
  }
}
