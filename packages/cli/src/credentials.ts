import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** One saved sign-in: the access token `flaghoist login` created for a server. */
export interface SavedCredential {
  token: string
  tokenId: string
  email: string
  savedAt: string
}

interface CredentialsFile {
  servers: Record<string, SavedCredential>
}

/**
 * Where `flaghoist login` keeps tokens: `$XDG_CONFIG_HOME/flaghoist/credentials.json`, falling back
 * to `~/.config`, or `%APPDATA%\flaghoist` on Windows. `FLAGHOIST_CONFIG_DIR` overrides it.
 */
export function credentialsPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  const dir =
    env.FLAGHOIST_CONFIG_DIR ??
    (platform === 'win32' && env.APPDATA
      ? join(env.APPDATA, 'flaghoist')
      : join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'flaghoist'))
  return join(dir, 'credentials.json')
}

/** Server URLs are keys, so `https://x/` and `https://x` must be the same server. */
export function serverKey(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function read(path: string): CredentialsFile {
  if (!existsSync(path)) return { servers: {} }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CredentialsFile>
    return { servers: parsed.servers && typeof parsed.servers === 'object' ? parsed.servers : {} }
  } catch {
    throw new Error(`Could not read ${path}. Fix or delete it, then sign in again.`)
  }
}

function write(path: string, file: CredentialsFile): void {
  // Readable by this user only: the file holds live credentials.
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
  chmodSync(path, 0o600)
}

export function savedCredential(path: string, url: string): SavedCredential | null {
  return read(path).servers[serverKey(url)] ?? null
}

/** The saved servers, for picking a default when there is exactly one. */
export function savedServers(path: string): string[] {
  return Object.keys(read(path).servers)
}

export function saveCredential(path: string, url: string, credential: SavedCredential): void {
  const file = read(path)
  file.servers[serverKey(url)] = credential
  write(path, file)
}

export function removeCredential(path: string, url: string): boolean {
  const file = read(path)
  const key = serverKey(url)
  if (!file.servers[key]) return false
  delete file.servers[key]
  write(path, file)
  return true
}
