import { parseConfig, type Asker } from 'flaghoist'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scaffold } from '../src/scaffold'

/**
 * Answers questions in order, like a person at a terminal would. Each answer is matched to the
 * question it is meant for, so a test fails loudly if the wizard asks something unexpected.
 */
function scripted(answers: [question: RegExp, answer: string][]): Asker & { asked: string[] } {
  const queue = [...answers]
  const asked: string[] = []
  const next = (question: string): string => {
    asked.push(question)
    const [pattern, answer] = queue.shift() ?? [/./, '']
    if (!pattern.test(question)) throw new Error(`Asked "${question}", expected ${pattern}`)
    return answer
  }
  return {
    interactive: true,
    asked,
    async text(q, fallback) {
      return next(q) || fallback
    },
    async choice(q, options, fallback) {
      const answer = next(q)
      return (options.find((o) => o.value === answer)?.value ?? fallback) as never
    },
    async yesNo(q, fallback) {
      const answer = next(q)
      return answer === '' ? fallback : answer === 'y'
    },
    async secret(q) {
      return next(q)
    },
    say() {},
  }
}

describe('scaffold', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'create-flaghoist-'))
  })
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('creates the directory and writes flaghoist.toml', async () => {
    const result = await scaffold({ directory: 'team-flags', cwd })

    expect(result.createdDirectory).toBe(true)
    expect(result.configPath).toBe(join(cwd, 'team-flags', 'flaghoist.toml'))
    expect(readFileSync(result.configPath, 'utf8')).toContain('name = "team-flags"')
  })

  // The point of sharing the CLI's serializer: whatever we scaffold, the CLI must be able to read
  // back. This is the test that would catch the two implementations drifting apart.
  it('writes a config the CLI parses back identically', async () => {
    const result = await scaffold({ directory: 'acme-flags', storage: 'postgres', cwd })
    const roundTripped = parseConfig(readFileSync(result.configPath, 'utf8'))

    expect(roundTripped.name).toBe('acme-flags')
    expect(roundTripped.storage).toBe('postgres')
    expect(roundTripped.auth).toEqual({ admin: 'bearer-token', read: 'api-key' })
    expect(roundTripped.accounts).toEqual({ enabled: true })
  })

  it('defaults to cloudflare-kv storage on the cloudflare platform', async () => {
    const { config } = await scaffold({ directory: 'defaults', cwd })
    expect(config.storage).toBe('cloudflare-kv')
    expect(config.platform).toBe('cloudflare')
  })

  it('rejects an unknown storage kind, listing the valid ones', async () => {
    await expect(scaffold({ directory: 'nope', storage: 'mysql', cwd })).rejects.toThrow(
      /Unknown storage "mysql".*cloudflare-kv/s,
    )
  })

  it('scaffolds a container project, coercing an unusable KV store to postgres', async () => {
    const { config } = await scaffold({ directory: 'containerized', platform: 'container', cwd })
    expect(config.platform).toBe('container')
    expect(config.storage).toBe('postgres')
  })

  it('keeps an explicit container-valid store on a container project', async () => {
    const { config } = await scaffold({
      directory: 'containerized-redis',
      platform: 'container',
      storage: 'redis',
      cwd,
    })
    expect(config.storage).toBe('redis')
  })

  it('rejects an unknown platform, listing the valid ones', async () => {
    await expect(scaffold({ directory: 'nope', platform: 'lambda', cwd })).rejects.toThrow(
      /Unknown platform "lambda".*cloudflare/s,
    )
  })

  it('scaffolds into an existing empty directory', async () => {
    mkdtempSync(join(cwd, 'premade-')) // unrelated sibling, should not matter
    const { configPath } = await scaffold({ directory: 'premade', cwd })
    expect(readFileSync(configPath, 'utf8')).toContain('name = "premade"')
  })

  it('refuses to scaffold over a non-empty directory', async () => {
    const dir = mkdtempSync(join(cwd, 'taken-'))
    writeFileSync(join(dir, 'important.txt'), 'do not clobber me')

    await expect(scaffold({ directory: dir, cwd })).rejects.toThrow(
      /already exists and is not empty/,
    )
    expect(readFileSync(join(dir, 'important.txt'), 'utf8')).toBe('do not clobber me')
  })

  it('scaffolds into the current directory when no directory is given and nobody is asked', async () => {
    const result = await scaffold({ cwd })
    expect(result.createdDirectory).toBe(false)
    expect(result.configPath).toBe(join(cwd, 'flaghoist.toml'))
    expect(result.config.name).toBe('team-flags')
  })

  it('refuses the current directory when it is not empty', async () => {
    writeFileSync(join(cwd, 'existing.txt'), 'x')
    await expect(scaffold({ cwd })).rejects.toThrow(/current directory is not empty/)
  })
})

describe('accounts and secrets', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'create-flaghoist-'))
  })
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('turns accounts on by default and keeps the pepper out of flaghoist.toml', async () => {
    const result = await scaffold({ directory: 'team', cwd })
    const pepper = result.setup.secrets.AUTH_PEPPER!
    expect(pepper).toMatch(/^[0-9a-f]{64}$/)

    const toml = readFileSync(result.configPath, 'utf8')
    expect(toml).toContain('[accounts]')
    expect(toml).toContain('enabled = true')
    expect(toml).not.toContain(pepper)

    const env = readFileSync(result.envPath!, 'utf8')
    expect(env).toContain(`AUTH_PEPPER=${pepper}`)
    expect(statSync(result.envPath!).mode & 0o777).toBe(0o600)
    expect(readFileSync(join(result.dir, '.gitignore'), 'utf8')).toMatch(/^\.env$/m)
  })

  it('generates a different pepper for every project', async () => {
    const a = await scaffold({ directory: 'a', cwd })
    const b = await scaffold({ directory: 'b', cwd })
    expect(a.setup.secrets.AUTH_PEPPER).not.toBe(b.setup.secrets.AUTH_PEPPER)
  })

  it('writes no accounts section, .env or pepper with --no-accounts', async () => {
    const result = await scaffold({ directory: 'solo', accounts: false, cwd })
    expect(readFileSync(result.configPath, 'utf8')).not.toContain('[accounts]')
    expect(result.envPath).toBeUndefined()
    expect(existsSync(join(result.dir, '.env'))).toBe(false)
  })

  it('records SSO settings from flags, with the admin group', async () => {
    const result = await scaffold({
      directory: 'sso',
      ssoIssuer: 'https://acme.okta.com',
      ssoClientId: '0oa1',
      ssoAdminGroup: 'flag-admins',
      cwd,
    })
    const parsed = parseConfig(readFileSync(result.configPath, 'utf8'))
    expect(parsed.accounts).toEqual({
      enabled: true,
      sso: { issuer: 'https://acme.okta.com', clientId: '0oa1', adminGroup: 'flag-admins' },
    })
  })

  it('explains what is missing when SSO is asked for without a terminal', async () => {
    await expect(scaffold({ directory: 'sso', sso: true, cwd })).rejects.toThrow(/--sso-issuer/)
  })
})

describe('the interactive setup', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'create-flaghoist-'))
  })
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('asks every question and creates a directory named after the project', async () => {
    const asker = scripted([
      [/Project name/, 'acme-flags'],
      [/Where will it run/, 'container'],
      [/Storage/, 'sqlite'],
      [/Accounts and roles/, 'y'],
      [/AUTH_PEPPER/, 'generate'],
      [/SSO/, 'y'],
      [/Issuer URL/, 'https://acme.okta.com'],
      [/Client ID/, '0oa1'],
      [/Group whose members become admins/, 'flag-admins'],
      [/Client secret/, 's3cret'],
      [/dashboard/, 'n'],
    ])
    const result = await scaffold({ asker, cwd })

    expect(result.dir).toBe(join(cwd, 'acme-flags'))
    expect(result.config).toMatchObject({
      name: 'acme-flags',
      platform: 'container',
      storage: 'sqlite',
      dashboard: false,
      accounts: { enabled: true, sso: { adminGroup: 'flag-admins' } },
    })
    const env = readFileSync(result.envPath!, 'utf8')
    expect(env).toContain('SSO_CLIENT_SECRET=s3cret')
    expect(readFileSync(result.configPath, 'utf8')).not.toContain('s3cret')
  })

  it('offers only the stores the chosen platform can reach', async () => {
    const offered: string[][] = []
    const asker = scripted([
      [/Project name/, ''],
      [/Where will it run/, 'container'],
      [/Storage/, ''],
      [/Accounts and roles/, 'n'],
      [/dashboard/, ''],
    ])
    const choice = asker.choice.bind(asker)
    asker.choice = async (q, options, fallback) => {
      if (/Storage/.test(q)) offered.push(options.map((o) => o.value))
      return choice(q, options, fallback)
    }
    const result = await scaffold({ asker, cwd })
    expect(offered[0]).toEqual(['postgres', 'redis', 'sqlite', 'memory'])
    expect(result.config.storage).toBe('postgres')
    expect(result.config.accounts).toBeUndefined()
  })

  it('accepts a pasted pepper, and refuses one that is too short', async () => {
    const pasted = 'a'.repeat(40)
    const asker = scripted([
      [/Project name/, 'pasted'],
      [/Where will it run/, 'cloudflare'],
      [/Storage/, 'cloudflare-kv'],
      [/Accounts and roles/, 'y'],
      [/AUTH_PEPPER/, 'paste'],
      [/Paste your AUTH_PEPPER/, 'too-short'],
      [/Paste your AUTH_PEPPER/, pasted],
      [/SSO/, 'n'],
      [/dashboard/, 'y'],
    ])
    const result = await scaffold({ asker, cwd })
    expect(result.setup.secrets.AUTH_PEPPER).toBe(pasted)
    expect(result.setup.pepperGenerated).toBe(false)
  })

  it('skips the questions the flags already answered', async () => {
    const asker = scripted([
      [/Accounts and roles/, 'y'],
      [/AUTH_PEPPER/, 'generate'],
      [/SSO/, 'n'],
      [/dashboard/, 'y'],
    ])
    const result = await scaffold({
      directory: 'flagged',
      platform: 'container',
      storage: 'redis',
      asker,
      cwd,
    })
    expect(asker.asked.some((q) => /Project name|Where will it run|Storage/.test(q))).toBe(false)
    expect(result.config).toMatchObject({
      name: 'flagged',
      platform: 'container',
      storage: 'redis',
    })
  })
})
