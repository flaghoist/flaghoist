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
