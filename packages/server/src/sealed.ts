import { fromBase64Url, toBase64Url } from './accounts'

/**
 * Small values the server hands out or stores and must read back unaltered: SSO state and
 * hand-back codes, sign-in challenges, and two-factor secrets. AES-GCM with a key derived from the
 * pepper, so they are both secret and tamper-evident, with nothing kept on the server.
 */

const encoder = new TextEncoder()
const sealKeys = new Map<string, Promise<CryptoKey>>()

function sealKey(pepper: string): Promise<CryptoKey> {
  let key = sealKeys.get(pepper)
  if (!key) {
    key = (async () => {
      const material = await crypto.subtle.importKey('raw', encoder.encode(pepper), 'HKDF', false, [
        'deriveKey',
      ])
      return crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(0),
          info: encoder.encode('flaghoist sso seal v1'),
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      )
    })()
    sealKeys.set(pepper, key)
  }
  return key
}

/** Encrypt and authenticate a small JSON value. `purpose` stops one kind being replayed as another. */
export async function seal(pepper: string, purpose: string, value: object): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = encoder.encode(JSON.stringify({ ...value, purpose }))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(pepper), plain),
  )
  const out = new Uint8Array(iv.length + cipher.length)
  out.set(iv)
  out.set(cipher, iv.length)
  return toBase64Url(out)
}

/** The value inside a sealed string, or null when it was tampered with, is for another purpose, or expired. */
export async function unseal<T extends { exp: number }>(
  pepper: string,
  purpose: string,
  sealed: string,
): Promise<T | null> {
  const bytes = fromBase64Url(sealed)
  if (!bytes || bytes.length < 29) return null
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await sealKey(pepper),
      bytes.slice(12),
    )
    const value = JSON.parse(new TextDecoder().decode(plain)) as T & { purpose?: string }
    if (value.purpose !== purpose || typeof value.exp !== 'number' || Date.now() > value.exp) {
      return null
    }
    return value
  } catch {
    return null
  }
}

export async function sha256Url(text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))))
}
