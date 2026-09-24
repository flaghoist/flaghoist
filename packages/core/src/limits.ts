/**
 * Resource limits enforced when parsing untrusted flag input. These bound how much work a
 * single flag can impose on evaluation, so a compromised or fat-fingered admin write cannot
 * wedge the read path. Generous enough that legitimate flags never hit them.
 */
export const LIMITS = {
  maxKeyLength: 256,
  maxRules: 100,
  maxConditionsPerRule: 50,
  maxListItems: 1000,
  maxValueLength: 1024,
  maxDescriptionLength: 2048,
} as const

const FLAG_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Attribute names that resolve onto the prototype chain rather than to real data. They are
 * never valid targeting attributes and must never be read from an evaluation context.
 */
export const FORBIDDEN_ATTRIBUTES: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

/**
 * A flag key is URL- and storage-safe: it appears verbatim in request paths
 * (`/flags/:key`, `/ofrep/v1/evaluate/flags/{key}`) and as a raw key in whatever storage
 * backend is plugged in. Restrict to alphanumerics plus dot, underscore, and hyphen,
 * starting with an alphanumeric, within a bounded length. This excludes path separators
 * and control characters, closing off traversal and key-injection classes for any adapter.
 */
export function isValidFlagKey(key: string): boolean {
  return key.length >= 1 && key.length <= LIMITS.maxKeyLength && FLAG_KEY_PATTERN.test(key)
}

/** Human-readable description of the flag key rule, for error messages. */
export const FLAG_KEY_RULE =
  'must be 1-256 characters of [A-Za-z0-9._-] and start with an alphanumeric'

const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/

/**
 * A record-store collection name. Collections are chosen by server code, never by callers, but
 * adapters embed them in storage keys and table rows, so the charset stays narrow: lowercase
 * alphanumerics and hyphens, no separators that could collide with an adapter's key layout.
 */
export function isValidCollectionName(name: string): boolean {
  return COLLECTION_NAME_PATTERN.test(name)
}

// Measured in UTF-8 bytes, not characters: Cloudflare KV caps a whole key at 512 bytes, and an id
// shares that budget with the adapter's prefix and the collection name.
const MAX_RECORD_ID_BYTES = 256

/**
 * A record id. Ids can carry user-supplied text (an email address used as a lookup key, say), so
 * they allow any printable characters but must be non-empty, bounded, and free of control
 * characters.
 */
export function isValidRecordId(id: string): boolean {
  if (id.length < 1 || new TextEncoder().encode(id).length > MAX_RECORD_ID_BYTES) return false
  for (let i = 0; i < id.length; i++) {
    const code = id.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

/** Throw if a collection name or record id is not safe to hand to a storage adapter. */
export function assertRecordAddress(collection: string, id?: string): void {
  if (!isValidCollectionName(collection)) {
    throw new Error(
      `Invalid record collection ${JSON.stringify(collection)}: must match ${COLLECTION_NAME_PATTERN.source}.`,
    )
  }
  if (id !== undefined && !isValidRecordId(id)) {
    throw new Error(
      `Invalid record id: must be 1-${MAX_RECORD_ID_BYTES} bytes with no control characters.`,
    )
  }
}
