#!/usr/bin/env node
import type { FeatureFlag } from '@flaghoist/core'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import {
  createAdminClient,
  createFlag,
  setRollout,
  setRules,
  toggleFlag,
  type AdminClient,
} from './admin'
import {
  asContainer,
  DEFAULT_CONFIG,
  parseConfig,
  PLATFORM_KINDS,
  serializeConfig,
  STORAGE_KINDS,
  type FlaghoistConfig,
  type PlatformKind,
  type StorageKind,
} from './config'
import {
  generateContainerPackageJson,
  generateDockerfile,
  generateDockerignore,
  generateNodeEntry,
} from './generate-container'
import {
  fillKvNamespaceId,
  generatePackageJson,
  generateWorkerEntry,
  generateWranglerToml,
  needsKvNamespace,
  parseKvNamespaceId,
} from './generate'
import { VERSION } from './version'

function writeFileSafe(path: string, content: string): void {
  mkdirSync(dirname(path) || '.', { recursive: true })
  writeFileSync(path, content)
}

function loadConfig(): FlaghoistConfig {
  if (!existsSync('flaghoist.toml')) {
    throw new Error('No flaghoist.toml found in this directory. Run `flaghoist init` first.')
  }
  return parseConfig(readFileSync('flaghoist.toml', 'utf8'))
}

function clientFrom(values: { url?: string; token?: string }): AdminClient {
  const url = values.url ?? process.env.FLAGS_URL
  const token = values.token ?? process.env.FLAGS_ADMIN_TOKEN
  if (!url) throw new Error('Missing server URL. Pass --url or set FLAGS_URL.')
  if (!token) throw new Error('Missing admin token. Pass --token or set FLAGS_ADMIN_TOKEN.')
  return createAdminClient({ url, token })
}

function flagState(flag: FeatureFlag): string {
  if (!flag.enabled) return 'disabled'
  const pct = flag.rollout.percentage
  return pct >= 100 ? 'on' : pct <= 0 ? 'off' : `${pct}%`
}

function printFlag(flag: FeatureFlag): void {
  const rules = flag.rules && flag.rules.length > 0 ? ` · ${flag.rules.length} rule(s)` : ''
  console.log(`${flag.key.padEnd(28)} ${flagState(flag).padEnd(10)}${rules}`)
}

async function runFlag(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      token: { type: 'string' },
      on: { type: 'boolean' },
      off: { type: 'boolean' },
      rollout: { type: 'string' },
      desc: { type: 'string' },
      file: { type: 'string' },
    },
  })
  const [sub, a, b] = positionals

  switch (sub) {
    case 'list': {
      const flags = await clientFrom(values).list()
      if (flags.length === 0) return console.log('No flags.')
      for (const flag of flags.sort((x, y) => x.key.localeCompare(y.key))) printFlag(flag)
      return
    }
    case 'get': {
      if (!a) throw new Error('Usage: flaghoist flag get <key>')
      const flag = await clientFrom(values).get(a)
      if (!flag) {
        console.error(`Flag "${a}" not found`)
        process.exit(1)
      }
      return console.log(JSON.stringify(flag, null, 2))
    }
    case 'create': {
      if (!a)
        throw new Error('Usage: flaghoist flag create <key> [--on] [--rollout N] [--desc "..."]')
      const flag = await createFlag(clientFrom(values), a, {
        enabled: values.on ?? false,
        percentage: values.rollout != null ? Number(values.rollout) : 0,
        description: values.desc,
      })
      console.log(`Created "${a}"`)
      return printFlag(flag)
    }
    case 'toggle': {
      if (!a) throw new Error('Usage: flaghoist flag toggle <key> [--on|--off]')
      const to = values.on ? true : values.off ? false : 'flip'
      return printFlag(await toggleFlag(clientFrom(values), a, to))
    }
    case 'rollout': {
      if (!a || b == null) throw new Error('Usage: flaghoist flag rollout <key> <percentage>')
      return printFlag(await setRollout(clientFrom(values), a, Number(b)))
    }
    case 'delete': {
      if (!a) throw new Error('Usage: flaghoist flag delete <key>')
      await clientFrom(values).delete(a)
      return console.log(`Deleted "${a}"`)
    }
    case 'rules': {
      if (a !== 'set' || !b)
        throw new Error('Usage: flaghoist flag rules set <key> --file rules.json')
      if (!values.file) throw new Error('Missing --file <rules.json>')
      const rules: unknown = JSON.parse(readFileSync(values.file, 'utf8'))
      if (!Array.isArray(rules)) throw new Error('Rules file must contain a JSON array')
      const flag = await setRules(clientFrom(values), b, rules)
      console.log(`Updated rules for "${b}"`)
      return printFlag(flag)
    }
    default:
      throw new Error(`Unknown flag command: ${sub ?? '(none)'}. Try "flaghoist flag list".`)
  }
}

function runInit(args: string[]): void {
  const { values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      storage: { type: 'string' },
      platform: { type: 'string' },
    },
  })
  if (existsSync('flaghoist.toml')) throw new Error('flaghoist.toml already exists.')
  if (values.storage && !STORAGE_KINDS.includes(values.storage as StorageKind)) {
    throw new Error(`Unknown storage "${values.storage}". One of: ${STORAGE_KINDS.join(', ')}.`)
  }
  if (values.platform && !PLATFORM_KINDS.includes(values.platform as PlatformKind)) {
    throw new Error(`Unknown platform "${values.platform}". One of: ${PLATFORM_KINDS.join(', ')}.`)
  }
  const base: FlaghoistConfig = {
    ...DEFAULT_CONFIG,
    name: values.name ?? DEFAULT_CONFIG.name,
    storage: (values.storage as StorageKind) ?? DEFAULT_CONFIG.storage,
  }
  // asContainer runs the storage through the container rule, so a container project never lands with
  // a KV choice it cannot use, even if one was passed explicitly.
  const config = values.platform === 'container' ? asContainer(base) : base
  writeFileSync('flaghoist.toml', serializeConfig(config))
  console.log('Created flaghoist.toml')
  console.log('Next: `flaghoist deploy` to ship it, or `flaghoist eject` to own the code.')
}

/** The file a scaffold writes first, and the marker for `eject`'s already-ejected check. */
function entryFile(platform: PlatformKind): string {
  return platform === 'container' ? 'server.mjs' : 'src/index.ts'
}

/** The generated files for a project, keyed by its platform. */
function projectFiles(config: FlaghoistConfig): [string, string][] {
  if (config.platform === 'container') {
    return [
      ['server.mjs', generateNodeEntry(config)],
      ['Dockerfile', generateDockerfile(config)],
      ['.dockerignore', generateDockerignore()],
      ['package.json', generateContainerPackageJson(config)],
    ]
  }
  return [
    ['src/index.ts', generateWorkerEntry(config)],
    ['wrangler.toml', generateWranglerToml(config)],
    ['package.json', generatePackageJson(config)],
  ]
}

/**
 * Write the generated project, refusing to overwrite anything already there.
 *
 * These land in the current directory, which is not always an empty one: `flaghoist init` will
 * happily run inside an existing app, and `deploy` calls this straight afterwards. Writing
 * unconditionally meant a real `package.json`, with its name, scripts and dependencies, was
 * replaced by the generated one and lost.
 */
function writeProject(config: FlaghoistConfig, dir: string): void {
  const files = projectFiles(config)
  const existing = files.map(([name]) => name).filter((name) => existsSync(join(dir, name)))
  if (existing.length > 0) {
    throw new Error(
      `Refusing to overwrite ${existing.join(', ')} in this directory.\n` +
        'Flaghoist deploys as its own service, so give it a directory of its own:\n' +
        '  npm create flaghoist@latest team-flags',
    )
  }
  for (const [name, contents] of files) writeFileSafe(join(dir, name), contents)
}

function runEject(): void {
  const config = loadConfig()
  const entry = entryFile(config.platform)
  // Checked before writeProject so an already-ejected project gets that answer, rather than the
  // generic advice about giving the service its own directory.
  if (existsSync(entry)) throw new Error(`${entry} already exists. Already ejected?`)
  writeProject(config, '.')
  if (config.platform === 'container') {
    console.log('Ejected to a code project you own: server.mjs, Dockerfile, package.json')
    console.log('Edit server.mjs freely, then build and run the container, or deploy to a host:')
    console.log('  https://docs.flaghoist.dev/deploy/overview/')
    return
  }
  console.log('Ejected to a code project you own: src/index.ts, wrangler.toml, package.json')
  if (config.storage === 'cloudflare-kv') {
    console.log('Create your KV namespace and paste the id into wrangler.toml:')
    console.log(`  npx wrangler kv namespace create ${config.name}-FLAGS`)
  }
  console.log('Edit src/index.ts freely, then: npm install && npx wrangler deploy')
}

/**
 * Create the KV namespace the generated `wrangler.toml` points at, and write its id back.
 *
 * Without this the very first command in the quickstart fails: a fresh project carries a
 * placeholder id, and wrangler refuses it. Only runs when the placeholder is still there, so an
 * id the user pasted in themselves is never touched.
 */
function ensureKvNamespace(config: FlaghoistConfig): void {
  if (config.storage !== 'cloudflare-kv') return
  const toml = readFileSync('wrangler.toml', 'utf8')
  if (!needsKvNamespace(toml)) return

  // Wrangler titles the namespace after the argument, and titles are unique per account, so a
  // bare "FLAGS" collides with every Flaghoist project after the first. Scoping it to the project
  // name keeps a second environment, or a second service, from failing on a name it never chose.
  const title = `${config.name}-FLAGS`
  console.log(`Creating the ${title} KV namespace...`)
  // stdin and stderr stay attached so wrangler can prompt for login and show its own errors;
  // stdout is captured because the namespace id is in it, then echoed so nothing is hidden.
  const created = spawnSync('npx', ['wrangler', 'kv', 'namespace', 'create', title], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
  })
  const output = created.stdout ?? ''
  if (output) process.stdout.write(output)

  if (created.status !== 0) {
    throw new Error(
      `Could not create the KV namespace. Run \`npx wrangler kv namespace create ${title}\` ` +
        'yourself, then paste the id into wrangler.toml.',
    )
  }
  const id = parseKvNamespaceId(output)
  if (!id) {
    throw new Error(
      'Created the namespace but could not read its id from wrangler output. Paste the id above ' +
        'into wrangler.toml, then run `flaghoist deploy` again.',
    )
  }
  writeFileSync('wrangler.toml', fillKvNamespaceId(toml, id))
  console.log(`Bound FLAGS to namespace ${id} in wrangler.toml`)
}

/**
 * Install the generated project's dependencies.
 *
 * The zero-config path writes a package.json and a Worker that imports from it, but the directory
 * a fresh `npm create flaghoist` leaves behind has no node_modules, so wrangler's bundler cannot
 * resolve `@flaghoist/server` and the deploy dies before it reaches Cloudflare. Skipped once the
 * directory has been installed, so repeat deploys do not pay for it.
 */
function ensureDependencies(): void {
  if (existsSync('node_modules')) return
  console.log('Installing dependencies...')
  const result = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error('`npm install` failed. Run it yourself, then `flaghoist deploy` again.')
  }
}

type DeployTarget = 'cloudflare' | 'other'

/**
 * Read `--target` if given. `cloudflare` (and its aliases) picks the built-in wrangler path;
 * anything else, or the literal `other`, means a non-Cloudflare host, which scaffolds the container
 * project. Returns null when no `--target` was passed, so the caller can prompt.
 */
function parseDeployTarget(args: string[]): DeployTarget | null {
  const i = args.indexOf('--target')
  if (i < 0) return null
  const value = args[i + 1]?.toLowerCase()
  if (value === 'cloudflare' || value === 'cf' || value === 'workers') return 'cloudflare'
  return 'other'
}

/** Interactive picker, only reached on a real terminal. */
async function promptDeployTarget(): Promise<DeployTarget> {
  console.log('Where do you want to deploy?')
  console.log('  1) Cloudflare Workers   recommended, deploys in one command')
  console.log('  2) Another platform     Render, a container, any Node host')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question('Choose [1]: ')).trim().toLowerCase()
    return answer === '2' || answer.startsWith('o') || answer.startsWith('r')
      ? 'other'
      : 'cloudflare'
  } finally {
    rl.close()
  }
}

/**
 * Scaffold the container project and hand over the next steps. Unlike the Cloudflare path this does
 * not deploy: container hosts differ enough (Fly, Railway, Render, a raw VPS) that the last mile
 * belongs to their own guides. The platform is written back to `flaghoist.toml`, so a re-run or an
 * `eject` keeps producing the container shape rather than reverting to a Worker.
 */
function deployContainer(config: FlaghoistConfig): void {
  const container = asContainer(config)
  // Persist the choice, and any storage coercion it implied, so the project is coherent from here.
  if (config.platform !== container.platform || config.storage !== container.storage) {
    writeFileSync('flaghoist.toml', serializeConfig(container))
  }
  if (!existsSync(entryFile('container'))) writeProject(container, '.')
  console.log(`
Scaffolded a container project: server.mjs, Dockerfile, package.json.

It runs on any container or Node host, configured by environment variables (FLAGS_STORAGE,
DATABASE_URL, ADMIN_TOKEN, READ_API_KEY). Build and run it with Docker:

  docker build -t ${container.name} .
  docker run -p 8080:8080 -e ADMIN_TOKEN=... -e READ_API_KEY=... ${container.name}

Or deploy it to a host:
  Render          https://docs.flaghoist.dev/deploy/render/
  Fly.io          https://docs.flaghoist.dev/deploy/fly/
  Railway         https://docs.flaghoist.dev/deploy/railway/
  All targets     https://docs.flaghoist.dev/deploy/overview/

Missing a platform you need? Open an issue at https://github.com/flaghoist/flaghoist/issues.`)
}

async function deployCloudflare(config: FlaghoistConfig): Promise<never> {
  if (!existsSync('src/index.ts')) writeProject(config, '.')
  // Dependencies first: this is where wrangler itself comes from, and the KV step below shells
  // out to it.
  ensureDependencies()
  ensureKvNamespace(config)
  console.log('Deploying with wrangler...')
  const result = spawnSync('npx', ['wrangler', 'deploy'], { stdio: 'inherit' })
  process.exit(result.status ?? 0)
}

async function runDeploy(args: string[]): Promise<void> {
  const config = loadConfig()
  let target = parseDeployTarget(args)
  if (target === null) {
    // No flag: a project already set to a container deploys that way without asking. Otherwise
    // prompt on a terminal, and default to Cloudflare when piped or in CI so the
    // `npm create flaghoist && npx flaghoist deploy` chain keeps working unattended.
    if (config.platform === 'container') target = 'other'
    else target = process.stdin.isTTY ? await promptDeployTarget() : 'cloudflare'
  }

  if (target === 'other') return deployContainer(config)
  return deployCloudflare(config)
}

function printHelp(): void {
  console.log(`flaghoist ${VERSION} — hoist your own feature flags

Usage: flaghoist <command>

Scaffolding
  init [--name N] [--storage cloudflare-kv|redis|postgres|memory] [--platform cloudflare|container]
  eject                    Generate a code project you own (a Worker, or a container)
  deploy [--target T]      Deploy (prompts for the platform; T is cloudflare or other)

Flag management (needs --url/--token or FLAGS_URL/FLAGS_ADMIN_TOKEN)
  flag list
  flag get <key>
  flag create <key> [--on] [--rollout N] [--desc "..."]
  flag toggle <key> [--on|--off]
  flag rollout <key> <percentage>
  flag rules set <key> --file rules.json
  flag delete <key>`)
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  switch (command) {
    case 'flag':
      return runFlag(rest)
    case 'init':
      return runInit(rest)
    case 'eject':
      return runEject()
    case 'deploy':
      return runDeploy(rest)
    case '-v':
    case '--version':
      return console.log(VERSION)
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      return printHelp()
    default:
      console.error(`Unknown command: ${command}\n`)
      printHelp()
      process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
