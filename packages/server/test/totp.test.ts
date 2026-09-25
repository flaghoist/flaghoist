import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  base32Encode,
  looksLikeRecoveryCode,
  matchTotp,
  newRecoveryCodes,
  normalizeRecoveryCode,
  otpauthUri,
  totpAt,
} from '../src/totp'

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string "12345678901234567890". The RFC's
// eight-digit values end in these six digits.
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'))
const RFC_VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
]

describe('time-based codes', () => {
  it('match the RFC 6238 test vectors', async () => {
    for (const [seconds, code] of RFC_VECTORS) {
      expect(await totpAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(code)
    }
  })

  it('accept the neighbouring step for clock drift, and nothing further', async () => {
    const now = 1_700_000_000_000
    const step = Math.floor(now / 30_000)
    for (const d of [-1, 0, 1]) {
      expect(await matchTotp(RFC_SECRET, await totpAt(RFC_SECRET, step + d), now)).toBe(step + d)
    }
    for (const d of [-2, 2]) {
      expect(await matchTotp(RFC_SECRET, await totpAt(RFC_SECRET, step + d), now)).toBeNull()
    }
    expect(await matchTotp(RFC_SECRET, 'abcdef', now)).toBeNull()
  })

  it('round-trip base32', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20))
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes)
    expect(base32Decode('not base32!')).toBeNull()
  })

  it('build the link an authenticator app scans', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'ada@example.com')
    expect(uri).toBe(
      'otpauth://totp/Flaghoist%3Aada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Flaghoist&algorithm=SHA1&digits=6&period=30',
    )
  })
})

describe('recovery codes', () => {
  it('are ten distinct codes in a readable shape', () => {
    const codes = newRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/)
  })

  it('compare however they are typed', () => {
    expect(normalizeRecoveryCode(' k7mq2 vx3tb ')).toBe('K7MQ2VX3TB')
    expect(looksLikeRecoveryCode('k7mq2-vx3tb')).toBe(true)
    expect(looksLikeRecoveryCode('123456')).toBe(false)
  })
})
