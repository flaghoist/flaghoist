import { clampPercentage } from './hash'
import type {
  Condition,
  ConditionValue,
  FeatureFlag,
  FlagMetadata,
  Operator,
  RuleResult,
  TargetingRule,
} from './types'

const OPERATORS: readonly Operator[] = [
  'eq',
  'neq',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'endsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'semverGte',
  'semverLt',
]

function asRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : null
}

function isConditionValue(v: unknown): v is ConditionValue {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return true
  if (Array.isArray(v)) return v.every((x) => typeof x === 'string' || typeof x === 'number')
  return false
}

function parseCondition(input: unknown): Condition | null {
  const o = asRecord(input)
  if (!o) return null
  if (typeof o.attribute !== 'string') return null
  if (typeof o.operator !== 'string' || !OPERATORS.includes(o.operator as Operator)) return null
  if (!isConditionValue(o.value)) return null
  return { attribute: o.attribute, operator: o.operator as Operator, value: o.value }
}

function parseRuleResult(input: unknown): RuleResult | null {
  const o = asRecord(input)
  if (!o || typeof o.enabled !== 'boolean') return null
  const result: RuleResult = { enabled: o.enabled }
  const rollout = asRecord(o.rollout)
  if (rollout && typeof rollout.percentage === 'number') {
    result.rollout = { percentage: clampPercentage(rollout.percentage) }
  }
  return result
}

function parseRule(input: unknown): TargetingRule | null {
  const o = asRecord(input)
  if (!o || !Array.isArray(o.conditions)) return null
  const conditions = o.conditions.map(parseCondition)
  if (conditions.some((c) => c === null)) return null
  const result = parseRuleResult(o.result)
  if (!result) return null
  const rule: TargetingRule = { conditions: conditions as Condition[], result }
  if (typeof o.description === 'string') rule.description = o.description
  return rule
}

function parseMetadata(input: unknown): FlagMetadata {
  const now = new Date().toISOString()
  const o = asRecord(input) ?? {}
  return {
    createdBy: typeof o.createdBy === 'string' ? o.createdBy : 'unknown',
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : now,
    updatedBy: typeof o.updatedBy === 'string' ? o.updatedBy : 'unknown',
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : now,
  }
}

/**
 * Parse arbitrary (untrusted) input — e.g. JSON read back from a storage adapter — into a
 * FeatureFlag, or return null if it is not a valid flag. A rule with any malformed condition
 * is rejected wholesale rather than silently weakened. Percentages are clamped to [0, 100].
 */
export function parseFlag(input: unknown): FeatureFlag | null {
  const o = asRecord(input)
  if (!o) return null
  if (typeof o.key !== 'string' || o.key.length === 0) return null
  if (typeof o.enabled !== 'boolean') return null

  const rollout = asRecord(o.rollout)
  const percentage =
    rollout && typeof rollout.percentage === 'number' ? clampPercentage(rollout.percentage) : 0

  const rules = Array.isArray(o.rules)
    ? o.rules.map(parseRule).filter((r): r is TargetingRule => r !== null)
    : []

  return {
    key: o.key,
    enabled: o.enabled,
    rollout: { percentage },
    rules,
    description: typeof o.description === 'string' ? o.description : '',
    metadata: parseMetadata(o.metadata),
  }
}

export interface CreateFlagInput {
  key: string
  enabled?: boolean
  rollout?: { percentage: number }
  rules?: TargetingRule[]
  description?: string
  /** Identity recorded in createdBy/updatedBy metadata. */
  identity?: string
}

/** Construct a well-formed FeatureFlag with sensible defaults and fresh metadata. */
export function createFlag(input: CreateFlagInput): FeatureFlag {
  const now = new Date().toISOString()
  const identity = input.identity ?? 'system'
  return {
    key: input.key,
    enabled: input.enabled ?? false,
    rollout: { percentage: clampPercentage(input.rollout?.percentage ?? 0) },
    rules: input.rules ?? [],
    description: input.description ?? '',
    metadata: { createdBy: identity, createdAt: now, updatedBy: identity, updatedAt: now },
  }
}
