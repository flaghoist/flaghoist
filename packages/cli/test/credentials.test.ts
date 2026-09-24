import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  credentialsPath,
  removeCredential,
  savedCredential,
  savedServers,
  saveCredential,
} from '../src/credentials'

const entry = { token: 'fh_pat_x', tokenId: 'tok_1', email: 'a@example.com', savedAt: '' }

describe('saved credentials', () => {
  it('live in the user config folder, or wherever FLAGHOIST_CONFIG_DIR says', () => {
    expect(credentialsPath({}, 'darwin', '/home/a')).toBe(
      '/home/a/.config/flaghoist/credentials.json',
    )
    expect(credentialsPath({ XDG_CONFIG_HOME: '/x' }, 'linux', '/home/a')).toBe(
      '/x/flaghoist/credentials.json',
    )
    expect(credentialsPath({ APPDATA: 'C:/AppData' }, 'win32', 'C:/Users/a')).toBe(
      join('C:/AppData', 'flaghoist', 'credentials.json'),
    )
    expect(credentialsPath({ FLAGHOIST_CONFIG_DIR: '/y' }, 'linux', '/home/a')).toBe(
      '/y/credentials.json',
    )
  })

  it('are saved per server, readable only by this user', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'flaghoist-')), 'nested', 'credentials.json')
    saveCredential(path, 'https://flags.example.com/', entry)
    expect(savedCredential(path, 'https://flags.example.com')).toEqual(entry)
    expect(savedServers(path)).toEqual(['https://flags.example.com'])
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(path, 'utf8')).servers).toHaveProperty(
      'https://flags.example.com',
    )
  })

  it('are forgotten on sign-out', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'flaghoist-')), 'credentials.json')
    saveCredential(path, 'https://a', entry)
    saveCredential(path, 'https://b', entry)
    expect(removeCredential(path, 'https://a')).toBe(true)
    expect(removeCredential(path, 'https://a')).toBe(false)
    expect(savedServers(path)).toEqual(['https://b'])
  })
})
