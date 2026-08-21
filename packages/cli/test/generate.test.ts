import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type FlaghoistConfig } from '../src/config'
import {
  fillKvNamespaceId,
  generatePackageJson,
  generateWorkerEntry,
  generateWranglerToml,
  needsKvNamespace,
  parseKvNamespaceId,
} from '../src/generate'

describe('generateWorkerEntry', () => {
  it('composes a cloudflare-kv + bearer-token worker', () => {
    const src = generateWorkerEntry(DEFAULT_CONFIG)
    expect(src).toContain(`import { cloudflareKV } from '@flaghoist/adapter-cloudflare-kv'`)
    expect(src).toContain('storage: cloudflareKV(env.FLAGS)')
    expect(src).toContain('admin: bearerToken(env.ADMIN_TOKEN)')
    expect(src).toContain('read: apiKey(env.READ_API_KEY)')
  })

  it('composes a redis worker via Upstash', () => {
    const src = generateWorkerEntry({ ...DEFAULT_CONFIG, storage: 'redis' })
    expect(src).toContain('@flaghoist/adapter-redis')
    expect(src).toContain('Redis.fromEnv(env)')
  })

  it('composes oidc admin auth instead of a bearer token', () => {
    const config: FlaghoistConfig = { ...DEFAULT_CONFIG, auth: { admin: 'oidc', read: 'api-key' } }
    const src = generateWorkerEntry(config)
    expect(src).toContain('admin: oidc({')
    expect(src).not.toContain('bearerToken')
  })

  it('includes the CORS allowlist when configured', () => {
    const src = generateWorkerEntry({
      ...DEFAULT_CONFIG,
      allowedOrigins: ['https://app.example.com'],
    })
    expect(src).toContain('allowedOrigins: ["https://app.example.com"]')
  })

  it('wires the dashboard in by default, so a fresh deploy answers /admin', () => {
    const src = generateWorkerEntry(DEFAULT_CONFIG)
    expect(src).toContain(`import { dashboardHtml } from '@flaghoist/server/dashboard'`)
    expect(src).toContain('dashboard: dashboardHtml,')
  })

  it('omits both the import and the config line when the dashboard is off', () => {
    const src = generateWorkerEntry({ ...DEFAULT_CONFIG, dashboard: false })
    expect(src).not.toContain('@flaghoist/server/dashboard')
    expect(src).not.toContain('dashboardHtml')
  })
})

describe('generateWranglerToml', () => {
  it('adds a KV namespace binding for cloudflare-kv', () => {
    const toml = generateWranglerToml(DEFAULT_CONFIG)
    expect(toml).toContain('kv_namespaces')
    expect(toml).toContain('binding = "FLAGS"')
  })

  it('leaves a placeholder id that deploy knows to fill', () => {
    expect(needsKvNamespace(generateWranglerToml(DEFAULT_CONFIG))).toBe(true)
  })

  it('scopes the namespace title to the project, since titles collide per account', () => {
    const toml = generateWranglerToml({ ...DEFAULT_CONFIG, name: 'staging-flags' })
    expect(toml).toContain('kv namespace create staging-flags-FLAGS')
    // The binding stays FLAGS; it is the account-wide title that has to be unique.
    expect(toml).toContain('binding = "FLAGS"')
  })

  it('needs no namespace on storage that does not use KV', () => {
    expect(needsKvNamespace(generateWranglerToml({ ...DEFAULT_CONFIG, storage: 'redis' }))).toBe(
      false,
    )
  })
})

describe('fillKvNamespaceId', () => {
  const id = '0f2ac74b498b48028cb68387c421e279'

  it('binds the real id and drops the how-to comment', () => {
    const filled = fillKvNamespaceId(generateWranglerToml(DEFAULT_CONFIG), id)
    expect(filled).toContain(`id = "${id}"`)
    expect(filled).toContain('binding = "FLAGS"')
    expect(filled).not.toContain('npx wrangler kv namespace create')
  })

  it('leaves nothing for a second deploy to redo', () => {
    const filled = fillKvNamespaceId(generateWranglerToml(DEFAULT_CONFIG), id)
    expect(needsKvNamespace(filled)).toBe(false)
  })
})

describe('parseKvNamespaceId', () => {
  const id = '0f2ac74b498b48028cb68387c421e279'

  it('reads the id out of the TOML block wrangler prints', () => {
    const output = [
      '🌀 Creating namespace with title "team-flags-FLAGS"',
      '✨ Success!',
      'Add the following to your configuration file in your kv_namespaces array:',
      '[[kv_namespaces]]',
      'binding = "FLAGS"',
      `id = "${id}"`,
    ].join('\n')
    expect(parseKvNamespaceId(output)).toBe(id)
  })

  it('reads a JSON-shaped id too', () => {
    expect(parseKvNamespaceId(`{"title":"team-flags-FLAGS","id":"${id}"}`)).toBe(id)
  })

  it('falls back to a bare id, so a reworded success message still works', () => {
    expect(parseKvNamespaceId(`Created namespace ${id} in account 1234`)).toBe(id)
  })

  it('returns undefined rather than guessing when there is no id', () => {
    expect(parseKvNamespaceId('✘ [ERROR] You need to login first.')).toBeUndefined()
    expect(parseKvNamespaceId('')).toBeUndefined()
  })
})

describe('generatePackageJson', () => {
  it('pins the storage adapter and its driver dependency', () => {
    const pkg = JSON.parse(generatePackageJson({ ...DEFAULT_CONFIG, storage: 'postgres' })) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@flaghoist/adapter-postgres']).toBeDefined()
    expect(pkg.dependencies['pg']).toBeDefined()
    expect(pkg.dependencies['@flaghoist/server']).toBeDefined()
  })
})
