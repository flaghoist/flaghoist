import { parseConfig } from 'flaghoist'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scaffold } from '../src/scaffold'

describe('scaffold', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'create-flaghoist-'))
  })
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('creates the directory and writes flaghoist.toml', () => {
    const result = scaffold({ directory: 'team-flags', cwd })

    expect(result.createdDirectory).toBe(true)
    expect(result.configPath).toBe(join(cwd, 'team-flags', 'flaghoist.toml'))
    expect(readFileSync(result.configPath, 'utf8')).toContain('name = "team-flags"')
  })

  // The point of sharing the CLI's serializer: whatever we scaffold, the CLI must be able to read
  // back. This is the test that would catch the two implementations drifting apart.
  it('writes a config the CLI parses back identically', () => {
    const result = scaffold({ directory: 'acme-flags', storage: 'postgres', cwd })
    const roundTripped = parseConfig(readFileSync(result.configPath, 'utf8'))

    expect(roundTripped.name).toBe('acme-flags')
    expect(roundTripped.storage).toBe('postgres')
    expect(roundTripped.auth).toEqual({ admin: 'bearer-token', read: 'api-key' })
  })

  it('defaults to cloudflare-kv storage', () => {
    const { config } = scaffold({ directory: 'defaults', cwd })
    expect(config.storage).toBe('cloudflare-kv')
  })

  it('rejects an unknown storage kind, listing the valid ones', () => {
    expect(() => scaffold({ directory: 'nope', storage: 'mysql', cwd })).toThrow(
      /Unknown storage "mysql".*cloudflare-kv/s,
    )
  })

  it('defaults to the cloudflare platform', () => {
    expect(scaffold({ directory: 'defaults', cwd }).config.platform).toBe('cloudflare')
  })

  it('scaffolds a container project, coercing an unusable KV store to postgres', () => {
    const { config } = scaffold({ directory: 'containerized', platform: 'container', cwd })
    expect(config.platform).toBe('container')
    expect(config.storage).toBe('postgres')
  })

  it('keeps an explicit container-valid store on a container project', () => {
    const { config } = scaffold({
      directory: 'containerized-redis',
      platform: 'container',
      storage: 'redis',
      cwd,
    })
    expect(config.storage).toBe('redis')
  })

  it('rejects an unknown platform, listing the valid ones', () => {
    expect(() => scaffold({ directory: 'nope', platform: 'lambda', cwd })).toThrow(
      /Unknown platform "lambda".*cloudflare/s,
    )
  })

  it('scaffolds into an existing empty directory', () => {
    const dir = join(cwd, 'premade')
    mkdtempSync(join(cwd, 'premade-')) // unrelated sibling, should not matter
    scaffold({ directory: 'premade', cwd })
    expect(readFileSync(join(dir, 'flaghoist.toml'), 'utf8')).toContain('name = "premade"')
  })

  it('refuses to scaffold over a non-empty directory', () => {
    const dir = mkdtempSync(join(cwd, 'taken-'))
    writeFileSync(join(dir, 'important.txt'), 'do not clobber me')

    expect(() => scaffold({ directory: dir, cwd })).toThrow(/already exists and is not empty/)
    expect(readFileSync(join(dir, 'important.txt'), 'utf8')).toBe('do not clobber me')
  })

  it('scaffolds into the current directory when no directory is given', () => {
    const result = scaffold({ cwd })
    expect(result.createdDirectory).toBe(false)
    expect(result.configPath).toBe(join(cwd, 'flaghoist.toml'))
    expect(result.config.name).toBe('team-flags')
  })

  it('refuses the current directory when it is not empty', () => {
    writeFileSync(join(cwd, 'existing.txt'), 'x')
    expect(() => scaffold({ cwd })).toThrow(/current directory is not empty/)
  })
})
