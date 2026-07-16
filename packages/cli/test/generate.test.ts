import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type FlaghoistConfig } from '../src/config'
import { generatePackageJson, generateWorkerEntry, generateWranglerToml } from '../src/generate'

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
})

describe('generateWranglerToml', () => {
  it('adds a KV namespace binding for cloudflare-kv', () => {
    const toml = generateWranglerToml(DEFAULT_CONFIG)
    expect(toml).toContain('kv_namespaces')
    expect(toml).toContain('binding = "FLAGS"')
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
