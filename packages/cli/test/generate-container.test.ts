import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type FlaghoistConfig } from '../src/config'
import {
  generateContainerPackageJson,
  generateDockerfile,
  generateDockerignore,
  generateNodeEntry,
} from '../src/generate-container'

// A container config: a config that has chosen the container platform and a container-valid store.
const containerConfig: FlaghoistConfig = {
  ...DEFAULT_CONFIG,
  platform: 'container',
  storage: 'postgres',
}

describe('generateNodeEntry', () => {
  it('serves the app with @hono/node-server on 0.0.0.0', () => {
    const src = generateNodeEntry(containerConfig)
    expect(src).toContain(`import { serve } from '@hono/node-server'`)
    expect(src).toContain(`serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })`)
  })

  it('reads the storage kind from env, defaulting to the configured store', () => {
    expect(generateNodeEntry(containerConfig)).toContain(`env.FLAGS_STORAGE ?? 'postgres'`)
    expect(generateNodeEntry({ ...containerConfig, storage: 'redis' })).toContain(
      `env.FLAGS_STORAGE ?? 'redis'`,
    )
  })

  it('defaults a cloudflare-kv config to postgres, since KV is unreachable off Workers', () => {
    const src = generateNodeEntry({ ...containerConfig, storage: 'cloudflare-kv' })
    expect(src).toContain(`env.FLAGS_STORAGE ?? 'postgres'`)
  })

  it('composes bearer-token admin auth by default', () => {
    const src = generateNodeEntry(containerConfig)
    expect(src).toContain('admin: bearerToken(env.ADMIN_TOKEN)')
    expect(src).toContain('read: apiKey(env.READ_API_KEY)')
    expect(src).not.toContain('oidc(')
  })

  it('composes oidc admin auth when configured', () => {
    const src = generateNodeEntry({
      ...containerConfig,
      auth: { admin: 'oidc', read: 'api-key' },
    })
    expect(src).toContain('admin: oidc({')
    expect(src).not.toContain('bearerToken')
  })

  it('wires the dashboard by default, and drops it when off', () => {
    expect(generateNodeEntry(containerConfig)).toContain(
      `import { dashboardHtml } from '@flaghoist/server/dashboard'`,
    )
    expect(generateNodeEntry(containerConfig)).toContain('dashboard: dashboardHtml,')
    const noDash = generateNodeEntry({ ...containerConfig, dashboard: false })
    expect(noDash).not.toContain('@flaghoist/server/dashboard')
    expect(noDash).not.toContain('dashboard: dashboardHtml')
  })

  it('bakes a configured CORS allowlist as the fallback, still overridable by FLAGS_CORS', () => {
    const src = generateNodeEntry({
      ...containerConfig,
      allowedOrigins: ['https://app.example.com'],
    })
    expect(src).toContain(
      'allowedOrigins: env.FLAGS_CORS ? env.FLAGS_CORS.split(\',\').map((o) => o.trim()) : ["https://app.example.com"]',
    )
  })

  it('leaves the allowlist undefined when none is configured', () => {
    expect(generateNodeEntry(containerConfig)).toContain(
      "env.FLAGS_CORS.split(',').map((o) => o.trim()) : undefined,",
    )
  })
})

describe('generateDockerfile', () => {
  it('builds a node:22-alpine image that runs the entry with a healthcheck', () => {
    const df = generateDockerfile(containerConfig)
    expect(df).toContain('FROM node:22-alpine')
    expect(df).toContain('CMD ["node", "server.mjs"]')
    expect(df).toContain('HEALTHCHECK')
    expect(df).toContain('/health')
    expect(df).toContain('EXPOSE 8080')
    expect(df).toContain('ENV FLAGS_STORAGE=postgres')
  })
})

describe('generateContainerPackageJson', () => {
  it('names the project and installs the server, all adapters, and the Node host deps', () => {
    const pkg = JSON.parse(generateContainerPackageJson({ ...containerConfig, name: 'my-flags' }))
    expect(pkg.name).toBe('my-flags')
    expect(pkg.scripts.start).toBe('node server.mjs')
    expect(pkg.dependencies).toHaveProperty('@flaghoist/server')
    // Every adapter is a static import in the entry, so all must be installed even though the store
    // is chosen at runtime.
    expect(pkg.dependencies).toHaveProperty('@flaghoist/adapter-postgres')
    expect(pkg.dependencies).toHaveProperty('@flaghoist/adapter-redis')
    expect(pkg.dependencies).toHaveProperty('@flaghoist/adapter-memory')
    expect(pkg.dependencies).toHaveProperty('@hono/node-server')
    expect(pkg.dependencies).toHaveProperty('pg')
    expect(pkg.dependencies).toHaveProperty('ioredis')
  })
})

describe('generateDockerignore', () => {
  it('excludes node_modules and the build files', () => {
    const ignore = generateDockerignore()
    expect(ignore).toContain('node_modules')
    expect(ignore).toContain('Dockerfile')
  })
})

// The generated entry and examples/docker/server.mjs are the same shape maintained in two places.
// Anchor the substantive storage logic to the example so an edit to one that misses the other fails
// here, rather than silently drifting.
describe('drift from examples/docker/server.mjs', () => {
  const example = readFileSync(
    fileURLToPath(new URL('../../../examples/docker/server.mjs', import.meta.url)),
    'utf8',
  )
  const generated = generateNodeEntry(containerConfig)
  const sharedLines = [
    `if (!env.DATABASE_URL) throw new Error('FLAGS_STORAGE=postgres requires DATABASE_URL')`,
    `ssl: /sslmode=/.test(env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },`,
    `redisAdapter(new Redis(env.REDIS_URL), { hashKey: env.FLAGS_HASH_KEY ?? 'flaghoist:flags' })`,
    `serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })`,
  ]

  it.each(sharedLines)('example still carries: %s', (line) => {
    expect(example).toContain(line)
  })

  it.each(sharedLines)('generated entry still carries: %s', (line) => {
    expect(generated).toContain(line)
  })
})
