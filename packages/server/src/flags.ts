import { clampPercentage, parseFlag, type FeatureFlag } from '@flaghoist/core'

export type BuildResult = { ok: true; flag: FeatureFlag } | { ok: false; error: string }

/**
 * Build a stored FeatureFlag from an admin PUT body. Preserves creation metadata on updates,
 * stamps the updater/time, and validates the whole thing through core's `parseFlag` (enforcing
 * the key charset, percentage clamping, and resource caps). Unlike a bare parse, malformed
 * targeting rules are reported as an error rather than silently dropped, so the admin gets
 * feedback instead of a quietly weakened flag.
 */
export function buildFlag(
  key: string,
  body: unknown,
  identity: string,
  existing: FeatureFlag | null,
): BuildResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  const enabled = typeof b.enabled === 'boolean' ? b.enabled : false
  const rollout =
    typeof b.rollout === 'object' && b.rollout !== null
      ? (b.rollout as Record<string, unknown>)
      : {}
  const percentage =
    typeof rollout.percentage === 'number' ? clampPercentage(rollout.percentage) : 0
  const description = typeof b.description === 'string' ? b.description : ''
  const inputRules = Array.isArray(b.rules) ? b.rules : []
  const now = new Date().toISOString()

  const candidate = {
    key,
    enabled,
    rollout: { percentage },
    rules: inputRules,
    description,
    metadata: {
      createdBy: existing?.metadata.createdBy ?? identity,
      createdAt: existing?.metadata.createdAt ?? now,
      updatedBy: identity,
      updatedAt: now,
    },
  }

  const validated = parseFlag(candidate)
  if (!validated) return { ok: false, error: 'Invalid flag definition' }
  if ((validated.rules?.length ?? 0) !== inputRules.length) {
    return { ok: false, error: 'One or more targeting rules are invalid' }
  }
  return { ok: true, flag: validated }
}
