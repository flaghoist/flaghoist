import { isInRollout } from './hash'
import { matchesAllConditions } from './operators'
import type { EvaluationContext, EvaluationResult, FeatureFlag, RuleResult } from './types'

function isSplit(percentage: number): boolean {
  return percentage > 0 && percentage < 100
}

async function resolveRule(
  result: RuleResult,
  targetingKey: string,
  flagKey: string,
  ruleIndex: number,
): Promise<EvaluationResult> {
  if (!result.enabled) return { value: false, reason: 'TARGETING_MATCH', ruleIndex }
  const percentage = result.rollout?.percentage ?? 100
  const value = await isInRollout(targetingKey, flagKey, percentage)
  return { value, reason: isSplit(percentage) ? 'SPLIT' : 'TARGETING_MATCH', ruleIndex }
}

/**
 * Evaluate one flag against a context. The cascade:
 *
 *   1. If the flag is disabled, serve off.
 *   2. Walk targeting rules in order; the first whose conditions all match decides the result
 *      (optionally gated by a per-rule rollout).
 *   3. If no rule matches, fall through to the flag's default rollout percentage.
 */
export async function evaluate(
  flag: FeatureFlag,
  context: EvaluationContext = {},
): Promise<EvaluationResult> {
  if (!flag.enabled) return { value: false, reason: 'DISABLED' }

  const targetingKey = context.targetingKey ?? ''

  let ruleIndex = 0
  for (const rule of flag.rules ?? []) {
    if (matchesAllConditions(rule.conditions, context)) {
      return resolveRule(rule.result, targetingKey, flag.key, ruleIndex)
    }
    ruleIndex++
  }

  const percentage = flag.rollout.percentage
  const value = await isInRollout(targetingKey, flag.key, percentage)
  return { value, reason: isSplit(percentage) ? 'SPLIT' : 'DEFAULT' }
}

/** Evaluate many flags against one context, returning a map keyed by flag key. */
export async function evaluateAll(
  flags: FeatureFlag[],
  context: EvaluationContext = {},
): Promise<Record<string, EvaluationResult>> {
  const entries = await Promise.all(
    flags.map(async (flag) => [flag.key, await evaluate(flag, context)] as const),
  )
  return Object.fromEntries(entries)
}
