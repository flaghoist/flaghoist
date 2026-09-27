import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import type { Readable, Writable } from 'node:stream'
import {
  containerStorageDefault,
  DEFAULT_CONFIG,
  serializeConfig,
  type FlaghoistConfig,
  type PlatformKind,
  type StorageKind,
} from './config'

/**
 * The interactive setup behind `npm create flaghoist` and `flaghoist init`. It asks for the choices
 * that shape a project, and writes them to `flaghoist.toml`. Secrets (the accounts pepper and an SSO
 * client secret) never go in that file: they go in a git-ignored `.env`, and `flaghoist deploy`
 * hands them to Cloudflare as Worker secrets.
 */

/** Everything the wizard asks through, so tests can script the answers. */
export interface Asker {
  text(question: string, fallback: string): Promise<string>
  choice<T extends string>(question: string, options: Choice<T>[], fallback: T): Promise<T>
  yesNo(question: string, fallback: boolean): Promise<boolean>
  secret(question: string): Promise<string>
  say(line: string): void
  /** False when nobody can answer, so a required value that is missing is an error, not a loop. */
  interactive?: boolean
}

export interface Choice<T extends string> {
  value: T
  label: string
  hint?: string
}

/** Answers given up front on the command line. Each one skips its question. */
export interface SetupPreset {
  name?: string
  platform?: PlatformKind
  storage?: StorageKind
  accounts?: boolean
  dashboard?: boolean
  sso?: boolean
  ssoIssuer?: string
  ssoClientId?: string
  ssoAdminGroup?: string
}

export interface SetupResult {
  config: FlaghoistConfig
  /** Secrets for `.env`: never written to `flaghoist.toml`. */
  secrets: Record<string, string>
  /** True when the pepper was generated here rather than pasted in. */
  pepperGenerated: boolean
}

export const MIN_PEPPER_LENGTH = 32

const PLATFORMS: Choice<PlatformKind>[] = [
  {
    value: 'cloudflare',
    label: 'Cloudflare Workers',
    hint: 'free plan, deploys in one command',
  },
  {
    value: 'container',
    label: 'Container, any host',
    hint: 'Render, Fly.io, Railway, a VPS, Kubernetes',
  },
]

/** The stores each platform can reach. Cloudflare KV only exists on Workers; SQLite needs a disk. */
export function storageChoices(platform: PlatformKind): Choice<StorageKind>[] {
  if (platform === 'cloudflare') {
    return [
      { value: 'cloudflare-kv', label: 'Cloudflare KV', hint: 'created for you on first deploy' },
      { value: 'redis', label: 'Redis', hint: 'Upstash, over HTTP' },
      { value: 'postgres', label: 'Postgres', hint: 'an HTTP-friendly host such as Neon' },
      { value: 'memory', label: 'Memory', hint: 'flags are lost on restart; for trying it out' },
    ]
  }
  return [
    { value: 'postgres', label: 'Postgres' },
    { value: 'redis', label: 'Redis' },
    { value: 'sqlite', label: 'SQLite', hint: 'one file on a mounted volume' },
    { value: 'memory', label: 'Memory', hint: 'flags are lost on restart; for trying it out' },
  ]
}

export function generatePepper(): string {
  return randomBytes(32).toString('hex')
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/

function validName(name: string): boolean {
  return NAME_PATTERN.test(name)
}

/** Ask every question the preset does not already answer, and build the project from the answers. */
export async function collectSetup(asker: Asker, preset: SetupPreset = {}): Promise<SetupResult> {
  let name = preset.name ?? ''
  while (!validName(name)) {
    if (name)
      asker.say('  Use lowercase letters, digits and hyphens, starting with a letter or digit.')
    name = (await asker.text('Project name', DEFAULT_CONFIG.name)).trim().toLowerCase()
  }

  const platform =
    preset.platform ?? (await asker.choice('Where will it run?', PLATFORMS, 'cloudflare'))

  const choices = storageChoices(platform)
  const presetStorage =
    preset.storage && platform === 'container'
      ? containerStorageDefault(preset.storage)
      : preset.storage
  const storage =
    presetStorage && choices.some((c) => c.value === presetStorage)
      ? presetStorage
      : await asker.choice('Storage', choices, choices[0]!.value)

  const accountsOn =
    preset.accounts ??
    (await asker.yesNo('Accounts and roles, so each person signs in as themselves?', true))

  const secrets: Record<string, string> = {}
  let pepperGenerated = false
  let sso: { issuer: string; clientId: string; adminGroup?: string } | undefined

  if (accountsOn) {
    asker.say('')
    asker.say('  Accounts need an AUTH_PEPPER: a secret that protects stored passwords. With it, a')
    asker.say('  stolen copy of your database reveals no password hashes an attacker can use.')
    asker.say(
      '  Losing it means everyone has to reset their password, so keep a copy somewhere safe.',
    )
    const source = await asker.choice(
      'AUTH_PEPPER',
      [
        { value: 'generate', label: 'Generate one for me', hint: 'recommended' },
        { value: 'paste', label: 'I have one, let me paste it' },
      ],
      'generate',
    )
    if (source === 'paste') {
      let pasted = ''
      while (pasted.length < MIN_PEPPER_LENGTH) {
        if (pasted) asker.say(`  It needs at least ${MIN_PEPPER_LENGTH} characters.`)
        pasted = (await asker.secret('Paste your AUTH_PEPPER')).trim()
      }
      secrets.AUTH_PEPPER = pasted
    } else {
      secrets.AUTH_PEPPER = generatePepper()
      pepperGenerated = true
    }

    const wantsSso =
      preset.sso ??
      (preset.ssoIssuer !== undefined ||
        (await asker.yesNo("Sign in with your company's identity provider (SSO)?", false)))
    if (wantsSso) {
      const issuer =
        preset.ssoIssuer ?? (await askUrl(asker, 'Issuer URL (for example https://acme.okta.com)'))
      const clientId = preset.ssoClientId ?? (await askRequired(asker, 'Client ID'))
      const adminGroup =
        preset.ssoAdminGroup ??
        (await asker.text('Group whose members become admins (blank for none)', '')).trim()
      const clientSecret = (
        await asker.secret('Client secret (blank if your app is public, or to add it later)')
      ).trim()
      if (clientSecret) secrets.SSO_CLIENT_SECRET = clientSecret
      sso = { issuer, clientId, ...(adminGroup ? { adminGroup } : {}) }
    }
  }

  const dashboard =
    preset.dashboard ?? (await asker.yesNo('Serve the admin dashboard at /admin?', true))

  const config: FlaghoistConfig = {
    ...DEFAULT_CONFIG,
    name,
    platform,
    storage,
    dashboard,
    ...(accountsOn ? { accounts: { enabled: true, ...(sso ? { sso } : {}) } } : {}),
  }
  return { config, secrets, pepperGenerated }
}

async function askRequired(asker: Asker, question: string): Promise<string> {
  let answer = ''
  while (!answer) {
    answer = (await asker.text(question, '')).trim()
    if (!answer && asker.interactive === false) {
      throw new Error(
        `SSO needs ${question.split(' (')[0]!.toLowerCase()}: pass --sso-issuer and --sso-client-id.`,
      )
    }
  }
  return answer
}

async function askUrl(asker: Asker, question: string): Promise<string> {
  for (;;) {
    const answer = await askRequired(asker, question)
    try {
      const url = new URL(answer)
      if (url.protocol === 'https:' || url.hostname === 'localhost') return answer
    } catch {
      /* fall through to the hint */
    }
    if (asker.interactive === false) throw new Error(`--sso-issuer must be an https:// URL.`)
    asker.say('  That needs to be an https:// URL.')
  }
}

// ---------------------------------------------------------------------------
// Writing the project
// ---------------------------------------------------------------------------

const GITIGNORE = ['.env', '.dev.vars', 'node_modules', '.wrangler', ''].join('\n')

/**
 * Write `flaghoist.toml`, and when there are secrets, a `.env` holding them plus a `.gitignore` that
 * keeps it out of git. An existing `.gitignore` gets `.env` appended rather than replaced.
 */
export function writeSetup(dir: string, result: SetupResult): { envPath?: string } {
  writeFileSync(join(dir, 'flaghoist.toml'), serializeConfig(result.config))
  if (Object.keys(result.secrets).length === 0) return {}

  const envPath = join(dir, '.env')
  const lines = [
    '# Secrets for this Flaghoist project. Never commit this file.',
    ...(result.config.platform === 'cloudflare'
      ? ['# `npx flaghoist deploy` sets these as secrets on your Worker.']
      : [
          '# Pass them to your container host as environment variables, or run with --env-file .env.',
        ]),
    ...Object.entries(result.secrets).map(([key, value]) => `${key}=${value}`),
    '',
  ]
  writeFileSync(envPath, lines.join('\n'), { mode: 0o600 })

  const gitignorePath = join(dir, '.gitignore')
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE)
  } else {
    const current = readFileSync(gitignorePath, 'utf8')
    if (!/^\.env$/m.test(current)) {
      writeFileSync(gitignorePath, `${current.replace(/\n?$/, '\n')}.env\n`)
    }
  }
  return { envPath }
}

/** Read `KEY=value` lines from a `.env` file. Comments and blank lines are skipped. */
export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line)
    if (match && !line.trim().startsWith('#'))
      out[match[1]!] = match[2]!.replace(/^["']|["']$/g, '')
  }
  return out
}

/** What to tell the person at the end, including the pepper once if it was generated. */
export function setupSummary(result: SetupResult, envWritten: boolean): string[] {
  const { config } = result
  const lines = [
    '',
    `  name       ${config.name}`,
    `  platform   ${config.platform === 'cloudflare' ? 'Cloudflare Workers' : 'container'}`,
    `  storage    ${config.storage}`,
    `  accounts   ${config.accounts?.enabled ? 'on' : 'off'}`,
    `  sso        ${config.accounts?.sso ? config.accounts.sso.issuer : 'off'}`,
    `  dashboard  ${config.dashboard ? 'on' : 'off'}`,
  ]
  if (result.pepperGenerated && result.secrets.AUTH_PEPPER) {
    lines.push(
      '',
      '  Your AUTH_PEPPER (save it in your password manager now; it is not shown again):',
      '',
      `    ${result.secrets.AUTH_PEPPER}`,
    )
  }
  if (envWritten) {
    lines.push(
      '',
      config.platform === 'cloudflare'
        ? '  Secrets are in .env (git-ignored). `npx flaghoist deploy` sets them on your Worker.'
        : '  Secrets are in .env (git-ignored). Add them to your host as environment variables too.',
    )
  }
  return lines
}

// ---------------------------------------------------------------------------
// The terminal asker
// ---------------------------------------------------------------------------

/** Ask on a real terminal. Choices are numbered; Enter takes the default shown in brackets. */
export function terminalAsker(
  input: Readable & { isTTY?: boolean } = process.stdin,
  output: Writable = process.stdout,
): Asker & { close(): void } {
  const rl = createInterface({ input, output, terminal: true })
  // Echo is switched off only while a secret is being typed.
  let muted = false
  const internal = rl as unknown as { _writeToOutput: (text: string) => void }
  const write = internal._writeToOutput.bind(rl)
  internal._writeToOutput = (text: string) => {
    if (!muted) write(text)
  }

  return {
    interactive: true,
    async text(question, fallback) {
      const answer = (
        await rl.question(`  ${question}${fallback ? ` (${fallback})` : ''}: `)
      ).trim()
      return answer || fallback
    },
    async choice(question, options, fallback) {
      output.write(`\n  ${question}\n`)
      options.forEach((o, i) => {
        output.write(`    ${i + 1}) ${o.label}${o.hint ? `   ${o.hint}` : ''}\n`)
      })
      const defaultIndex =
        Math.max(
          0,
          options.findIndex((o) => o.value === fallback),
        ) + 1
      for (;;) {
        const answer = (await rl.question(`  Choose (${defaultIndex}): `)).trim()
        if (!answer) return options[defaultIndex - 1]!.value
        const index = Number(answer)
        if (Number.isInteger(index) && index >= 1 && index <= options.length) {
          return options[index - 1]!.value
        }
        output.write(`  Enter a number from 1 to ${options.length}.\n`)
      }
    },
    async yesNo(question, fallback) {
      for (;;) {
        const answer = (await rl.question(`\n  ${question} (${fallback ? 'Y/n' : 'y/N'}): `))
          .trim()
          .toLowerCase()
        if (!answer) return fallback
        if (answer === 'y' || answer === 'yes') return true
        if (answer === 'n' || answer === 'no') return false
      }
    },
    async secret(question) {
      output.write(`  ${question}: `)
      muted = true
      try {
        return await rl.question('')
      } finally {
        muted = false
        output.write('\n')
      }
    },
    say(line) {
      output.write(`${line}\n`)
    },
    close() {
      rl.close()
    },
  }
}

/** The asker used without a terminal: every question takes its default, and nothing is printed. */
export function defaultsAsker(): Asker {
  return {
    interactive: false,
    async text(_q, fallback) {
      return fallback
    },
    async choice(_q, _options, fallback) {
      return fallback
    },
    async yesNo(_q, fallback) {
      return fallback
    },
    async secret() {
      return ''
    },
    say() {},
  }
}
