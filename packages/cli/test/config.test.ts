import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, parseConfig, serializeConfig } from '../src/config'

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
})
