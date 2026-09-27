import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, parseConfig, serializeConfig, type FlaghoistConfig } from '../src/config'
import { generateNodeEntry } from '../src/generate-container'
import { generateWorkerEntry } from '../src/generate'
import { readEnvFile, setupSummary, writeSetup, type SetupResult } from '../src/setup'
import { parseSecretNames, syncWorkerSecrets, type WranglerRunner } from '../src/worker-secrets'

const PEPPER = 'p'.repeat(64)
const withAccounts: FlaghoistConfig = { ...DEFAULT_CONFIG, accounts: { enabled: true } }
const withSso: FlaghoistConfig = {
  ...DEFAULT_CONFIG,
  accounts: {
    enabled: true,
    sso: { issuer: 'https://acme.okta.com', clientId: '0oa1', adminGroup: 'flag-admins' },
  },
}

describe('[accounts] in flaghoist.toml', () => {
  it('round-trips accounts and SSO settings', () => {
    expect(parseConfig(serializeConfig(withSso)).accounts).toEqual(withSso.accounts)
  })

  it('leaves accounts off when the table is absent', () => {
    expect(parseConfig(serializeConfig(DEFAULT_CONFIG)).accounts).toBeUndefined()
  })
})

describe('the users block in generated servers', () => {
  it.each([
    ['Worker', generateWorkerEntry],
    [
      'container',
      (c: FlaghoistConfig) =>
        generateNodeEntry({ ...c, platform: 'container', storage: 'postgres' }),
    ],
  ])('%s: reads the pepper from the environment when accounts are on', (_, generate) => {
    expect(generate(DEFAULT_CONFIG)).not.toContain('users:')
    const src = generate(withAccounts)
    expect(src).toContain('users: {')
    expect(src).toContain('pepper: env.AUTH_PEPPER')
    expect(src).not.toContain('sso:')
  })

  it('maps the admin group to the admin role, and reads the client secret from the environment', () => {
    const src = generateWorkerEntry(withSso)
    expect(src).toContain('issuer: "https://acme.okta.com"')
    expect(src).toContain('clientSecret: env.SSO_CLIENT_SECRET')
    expect(src).toContain(`"flag-admins": 'admin'`)
  })

  it('omits the role mapping when no admin group is set', () => {
    const src = generateWorkerEntry({
      ...DEFAULT_CONFIG,
      accounts: { enabled: true, sso: { issuer: 'https://acme.okta.com', clientId: '0oa1' } },
    })
    expect(src).toContain('sso: {')
    expect(src).not.toContain('roleMapping')
  })
})

describe('writeSetup', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-setup-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const result: SetupResult = {
    config: withAccounts,
    secrets: { AUTH_PEPPER: PEPPER },
    pepperGenerated: true,
  }

  it('keeps secrets in a private .env and out of flaghoist.toml', () => {
    const { envPath } = writeSetup(dir, result)
    expect(readFileSync(join(dir, 'flaghoist.toml'), 'utf8')).not.toContain(PEPPER)
    expect(readEnvFile(envPath!)).toEqual({ AUTH_PEPPER: PEPPER })
    expect(statSync(envPath!).mode & 0o777).toBe(0o600)
  })

  it('appends .env to an existing .gitignore without replacing it', () => {
    writeFileSync(join(dir, '.gitignore'), 'dist')
    writeSetup(dir, result)
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('dist\n.env\n')
  })

  it('writes no .env when there are no secrets', () => {
    expect(
      writeSetup(dir, { config: DEFAULT_CONFIG, secrets: {}, pepperGenerated: false }),
    ).toEqual({})
  })
})

describe('readEnvFile', () => {
  it('skips comments and blank lines, and strips quotes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flaghoist-env-'))
    const path = join(dir, '.env')
    writeFileSync(path, '# comment\n\nA=1\nB="two"\n')
    expect(readEnvFile(path)).toEqual({ A: '1', B: 'two' })
    expect(readEnvFile(join(dir, 'missing'))).toEqual({})
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('setupSummary', () => {
  it('shows a generated pepper once, and never a pasted one', () => {
    const generated = setupSummary(
      { config: withAccounts, secrets: { AUTH_PEPPER: PEPPER }, pepperGenerated: true },
      true,
    )
    expect(generated.join('\n')).toContain(PEPPER)
    const pasted = setupSummary(
      { config: withAccounts, secrets: { AUTH_PEPPER: PEPPER }, pepperGenerated: false },
      true,
    )
    expect(pasted.join('\n')).not.toContain(PEPPER)
  })
})

describe('syncWorkerSecrets', () => {
  function fakeWrangler(existing: string[], listStatus = 0) {
    const calls: { args: string[]; input?: string }[] = []
    const run: WranglerRunner = (args, input) => {
      calls.push({ args, input })
      if (args[1] === 'list') {
        return {
          status: listStatus,
          stdout: JSON.stringify(existing.map((name) => ({ name, type: 'secret_text' }))),
        }
      }
      return { status: 0, stdout: '' }
    }
    return { run, calls }
  }
  const log: string[] = []
  const say = (line: string) => log.push(line)

  it('does nothing when accounts are off', () => {
    const { run, calls } = fakeWrangler([])
    expect(syncWorkerSecrets(DEFAULT_CONFIG, {}, run, say)).toEqual({ set: [], missing: [] })
    expect(calls).toEqual([])
  })

  it('sets missing secrets from .env, passing values on stdin', () => {
    const { run, calls } = fakeWrangler([])
    const env = { AUTH_PEPPER: PEPPER, SSO_CLIENT_SECRET: 's3cret' }
    expect(syncWorkerSecrets(withSso, env, run, say).set).toEqual([
      'AUTH_PEPPER',
      'SSO_CLIENT_SECRET',
    ])
    expect(calls[1]).toEqual({ args: ['secret', 'put', 'AUTH_PEPPER'], input: PEPPER })
    expect(calls.some((c) => c.args.includes(PEPPER))).toBe(false)
  })

  it('never replaces a secret the Worker already has', () => {
    const { run, calls } = fakeWrangler(['AUTH_PEPPER'])
    const result = syncWorkerSecrets(withAccounts, { AUTH_PEPPER: PEPPER }, run, say)
    expect(result).toEqual({ set: [], missing: [] })
    expect(calls).toHaveLength(1)
  })

  it('reports a secret that is neither on the Worker nor in .env', () => {
    const { run } = fakeWrangler([])
    expect(syncWorkerSecrets(withAccounts, {}, run, say).missing).toEqual(['AUTH_PEPPER'])
  })

  it('changes nothing when the existing secrets cannot be listed', () => {
    const { run, calls } = fakeWrangler([], 1)
    const result = syncWorkerSecrets(withAccounts, { AUTH_PEPPER: PEPPER }, run, say)
    expect(result.missing).toEqual(['AUTH_PEPPER'])
    expect(calls).toHaveLength(1)
  })
})

describe('parseSecretNames', () => {
  it('reads names past any banner wrangler prints first', () => {
    expect(parseSecretNames('wrangler 4\n[{"name":"A"}]')).toEqual(new Set(['A']))
    expect(parseSecretNames('not json')).toBeNull()
  })
})
