import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js')

let dir: string

beforeAll(() => {
  if (!existsSync(BIN)) {
    throw new Error(`CLI binary not built at ${BIN} — run \`pnpm --filter flaghoist build\` first`)
  }
})

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function run(...args: string[]) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8' })
}

describe('scaffolding into a directory that is already in use', () => {
  it('refuses to overwrite an existing package.json, and leaves it untouched', () => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-scaffold-'))
    const theirs = '{\n  "name": "my-app",\n  "version": "2.4.0"\n}\n'
    writeFileSync(join(dir, 'package.json'), theirs)
    run('init')

    const ejected = run('eject')

    expect(ejected.status).not.toBe(0)
    expect(ejected.stderr).toContain('Refusing to overwrite package.json')
    // The whole point: their file survives. Previously it was replaced by the generated one.
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(theirs)
    expect(existsSync(join(dir, 'src/index.ts'))).toBe(false)
  })

  it('points at giving the service its own directory rather than just failing', () => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-scaffold-'))
    writeFileSync(join(dir, 'package.json'), '{}\n')
    run('init')

    expect(run('eject').stderr).toContain('npm create flaghoist')
  })

  it('still scaffolds normally into a directory of its own', () => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-scaffold-'))
    run('init')

    const ejected = run('eject')

    expect(ejected.status).toBe(0)
    for (const file of ['src/index.ts', 'wrangler.toml', 'package.json']) {
      expect(existsSync(join(dir, file))).toBe(true)
    }
  })

  it('tells an already-ejected project what it is, rather than the directory advice', () => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-scaffold-'))
    run('init')
    run('eject')

    expect(run('eject').stderr).toContain('Already ejected?')
  })
})

describe('the container platform', () => {
  it('init --platform container writes a container config with a container-valid store', () => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-scaffold-'))

    expect(run('init', '--platform', 'container').status).toBe(0)

    const toml = readFileSync(join(dir, 'flaghoist.toml'), 'utf8')
    expect(toml).toContain('platform = "container"')
    // KV is a Worker binding, so a container project defaults to postgres instead.
    expect(toml).toContain('storage = "postgres"')
  })

  it('ejects the container file set, not the Worker one', () => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-scaffold-'))
    run('init', '--platform', 'container')

    const ejected = run('eject')

    expect(ejected.status).toBe(0)
    for (const file of ['server.mjs', 'Dockerfile', '.dockerignore', 'package.json']) {
      expect(existsSync(join(dir, file))).toBe(true)
    }
    expect(existsSync(join(dir, 'src/index.ts'))).toBe(false)
    expect(existsSync(join(dir, 'wrangler.toml'))).toBe(false)
  })

  it('deploy --target other scaffolds the container and persists the choice, without deploying', () => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-scaffold-'))
    run('init') // a default (Cloudflare) project

    const deployed = run('deploy', '--target', 'other')

    expect(deployed.status).toBe(0)
    expect(deployed.stdout).toContain('Scaffolded a container project')
    // No wrangler, no deploy: the guides own the last mile for container hosts.
    expect(deployed.stdout).not.toContain('Deploying with wrangler')
    expect(existsSync(join(dir, 'server.mjs'))).toBe(true)
    expect(existsSync(join(dir, 'Dockerfile'))).toBe(true)
    // The platform is written back, so a re-run keeps producing the container shape.
    const toml = readFileSync(join(dir, 'flaghoist.toml'), 'utf8')
    expect(toml).toContain('platform = "container"')
    expect(toml).toContain('storage = "postgres"')
  })

  it('a saved container project deploys as a container without a --target flag', () => {
    dir = mkdtempSync(join(tmpdir(), 'flaghoist-scaffold-'))
    run('init', '--platform', 'container')

    const deployed = run('deploy')

    expect(deployed.status).toBe(0)
    expect(deployed.stdout).toContain('Scaffolded a container project')
    expect(existsSync(join(dir, 'server.mjs'))).toBe(true)
  })
})
