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
