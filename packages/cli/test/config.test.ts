import { describe, expect, it } from 'vitest'
import {
  asContainer,
  containerStorageDefault,
  DEFAULT_CONFIG,
  parseConfig,
  serializeConfig,
} from '../src/config'

describe('config', () => {
  it('round-trips through TOML', () => {
    const toml = serializeConfig({
      ...DEFAULT_CONFIG,
      name: 'my-flags',
      allowedOrigins: ['https://app.example.com'],
    })
    const parsed = parseConfig(toml)
    expect(parsed.name).toBe('my-flags')
    expect(parsed.storage).toBe('cloudflare-kv')
    expect(parsed.auth.admin).toBe('bearer-token')
    expect(parsed.auth.read).toBe('api-key')
    expect(parsed.allowedOrigins).toEqual(['https://app.example.com'])
  })

  it('reads oidc admin auth and a non-default storage', () => {
    const parsed = parseConfig(`
      name = "prod"
      storage = "postgres"
      [auth]
      admin = "oidc"
      read = "api-key"
    `)
    expect(parsed.storage).toBe('postgres')
    expect(parsed.auth.admin).toBe('oidc')
  })

  it('falls back to defaults for unknown or missing values', () => {
    const parsed = parseConfig('storage = "nonsense"')
    expect(parsed.storage).toBe('cloudflare-kv')
    expect(parsed.name).toBe('team-flags')
    expect(parsed.auth.admin).toBe('bearer-token')
  })

  it('defaults the dashboard on, and omits the key when it is', () => {
    expect(DEFAULT_CONFIG.dashboard).toBe(true)
    expect(parseConfig('name = "prod"').dashboard).toBe(true)
    expect(serializeConfig(DEFAULT_CONFIG)).not.toContain('dashboard')
  })

  it('round-trips an explicit dashboard opt-out', () => {
    const toml = serializeConfig({ ...DEFAULT_CONFIG, dashboard: false })
    expect(toml).toContain('dashboard = false')
    expect(parseConfig(toml).dashboard).toBe(false)
  })

  it('treats any non-false dashboard value as on', () => {
    // Guards the upgrade path: a config written before the key existed must keep the UI.
    expect(parseConfig('dashboard = "yes"').dashboard).toBe(true)
    expect(parseConfig('').dashboard).toBe(true)
  })

  it('defaults the platform to cloudflare, and omits the key when it is', () => {
    expect(DEFAULT_CONFIG.platform).toBe('cloudflare')
    expect(parseConfig('name = "prod"').platform).toBe('cloudflare')
    expect(serializeConfig(DEFAULT_CONFIG)).not.toContain('platform')
  })

  it('round-trips a container platform', () => {
    const toml = serializeConfig({ ...DEFAULT_CONFIG, platform: 'container' })
    expect(toml).toContain('platform = "container"')
    expect(parseConfig(toml).platform).toBe('container')
  })

  it('treats an unknown platform as cloudflare', () => {
    // A config written before the key existed, or with a typo, must still scaffold a Worker.
    expect(parseConfig('platform = "nonsense"').platform).toBe('cloudflare')
    expect(parseConfig('').platform).toBe('cloudflare')
  })

  it('keeps a container-valid store but rewrites cloudflare-kv, which is a Worker binding', () => {
    expect(containerStorageDefault('postgres')).toBe('postgres')
    expect(containerStorageDefault('redis')).toBe('redis')
    expect(containerStorageDefault('memory')).toBe('memory')
    expect(containerStorageDefault('cloudflare-kv')).toBe('postgres')
  })

  it('recasts a config for the container platform, coercing an unusable KV store', () => {
    const worker = { ...DEFAULT_CONFIG, storage: 'cloudflare-kv' as const }
    const container = asContainer(worker)
    expect(container.platform).toBe('container')
    expect(container.storage).toBe('postgres')
    // A store the container can use is left alone.
    expect(asContainer({ ...DEFAULT_CONFIG, storage: 'redis' }).storage).toBe('redis')
  })
})
