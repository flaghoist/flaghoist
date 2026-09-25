/**
 * Time-based one-time codes (RFC 6238), the six digits an authenticator app shows: HMAC-SHA1 over
 * the number of 30-second steps since the epoch. SHA-1 is what every authenticator app supports,
 * and inside HMAC it is not weakened by SHA-1's collision attacks.
 */

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
const SECRET_BYTES = 20
// Accept the step before and after the current one, so a phone clock a little off still works.
const DRIFT_STEPS = 1

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const index = BASE32.indexOf(ch)
    if (index < 0) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)))
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS)
}

export async function totpAt(secret: string, step: number): Promise<string> {
  const key = base32Decode(secret)
  if (!key) throw new Error('Invalid two-factor secret')
  const counter = new Uint8Array(8)
  let rest = step
  for (let i = 7; i >= 0; i--) {
    counter[i] = rest & 255
    rest = Math.floor(rest / 256)
  }
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, counter))
  const offset = mac[mac.length - 1]! & 15
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

/**
 * The step a code belongs to, within the allowed drift, or null. The caller refuses any step at
 * or before the last one used, so a code cannot be replayed.
 */
export async function matchTotp(
  secret: string,
  code: string,
  now = Date.now(),
): Promise<number | null> {
  const digits = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) return null
  const step = currentStep(now)
  for (let d = -DRIFT_STEPS; d <= DRIFT_STEPS; d++) {
    if ((await totpAt(secret, step + d)) === digits) return step + d
  }
  return null
}

/** The `otpauth://` link an authenticator app scans from the QR code. */
export function otpauthUri(secret: string, account: string, issuer = 'Flaghoist'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${params}`
}

// ---- Recovery codes -----------------------------------------------------------

export const RECOVERY_CODE_COUNT = 10

/** Ten codes like `K7MQ2-VX3TB`, each good for one sign-in. Shown once, stored as hashes. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = base32Encode(crypto.getRandomValues(new Uint8Array(7))).slice(0, 10)
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

/** Recovery codes compare without case, spaces or the dash, however they were typed. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '')
}

export function looksLikeRecoveryCode(code: string): boolean {
  return /^[A-Z2-7]{10}$/.test(normalizeRecoveryCode(code))
}
