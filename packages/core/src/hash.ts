/** Clamp a percentage into [0, 100]; NaN becomes 0 (conservative — feature stays hidden). */
export function clampPercentage(percentage: number): number {
  if (Number.isNaN(percentage)) return 0
  return Math.max(0, Math.min(100, percentage))
}

/**
 * Deterministically map a seed string into a bucket in [0, 100). Uses SHA-256 so the
 * distribution is uniform and the result is stable across runtimes and languages — the
 * same seed always lands in the same bucket. Cryptographic strength is incidental here;
 * what matters is determinism and even spread.
 */
export async function stickyBucket(seed: string): Promise<number> {
  const data = new TextEncoder().encode(seed)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return new DataView(digest).getUint32(0) % 100
}

/**
 * Decide whether a given target is inside a percentage rollout for a flag. Sticky: the
 * same (targetingKey, flagKey) pair always resolves the same way, so a partner does not
 * flip in and out of a feature between page loads. No assignment state is stored.
 */
export async function isInRollout(
  targetingKey: string,
  flagKey: string,
  percentage: number,
): Promise<boolean> {
  const pct = clampPercentage(percentage)
  if (pct >= 100) return true
  if (pct <= 0) return false
  const bucket = await stickyBucket(`${targetingKey}:${flagKey}`)
  return bucket < pct
}
