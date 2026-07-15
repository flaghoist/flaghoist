/**
 * Comparison operators available to targeting conditions. The set is intentionally
 * bounded for v1; regex (`matches`) is deliberately excluded as a ReDoS footgun.
 */
export type Operator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'semverGte'
  | 'semverLt'

/** A scalar attribute drawn from the evaluation context. */
export type AttributeValue = string | number | boolean

/** A value a condition compares against — scalar, or a list for `in` / `notIn`. */
export type ConditionValue = string | number | boolean | Array<string | number>

/** A single `attribute operator value` predicate. */
export interface Condition {
  attribute: string
  operator: Operator
  value: ConditionValue
}

/** What a matched targeting rule serves. */
export interface RuleResult {
  enabled: boolean
  /** Optional rollout within the matched cohort. Absent means 100% (fully on). */
  rollout?: { percentage: number }
}

/**
 * An ordered targeting rule. All `conditions` must hold (logical AND); express OR
 * with a second rule. Rules are evaluated top to bottom and the first match wins.
 */
export interface TargetingRule {
  description?: string
  conditions: Condition[]
  result: RuleResult
}

export interface FlagMetadata {
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

/**
 * A feature flag as stored. `rules` is optional and additive: a flag with no rules
 * evaluates purely on `enabled` + `rollout`, identical to a plain boolean-with-percentage
 * flag. The top-level `rollout` acts as the default rule when no targeting rule matches.
 */
export interface FeatureFlag {
  key: string
  enabled: boolean
  rollout: { percentage: number }
  rules?: TargetingRule[]
  description: string
  metadata: FlagMetadata
}

/**
 * The OpenFeature-style evaluation context: an optional stable `targetingKey` used for
 * sticky percentage bucketing, plus arbitrary attributes referenced by targeting rules.
 */
export interface EvaluationContext {
  targetingKey?: string
  [attribute: string]: AttributeValue | undefined
}

/** Why a flag resolved the way it did. Maps onto OpenFeature/OFREP resolution reasons. */
export type EvaluationReason = 'DISABLED' | 'TARGETING_MATCH' | 'SPLIT' | 'DEFAULT'

export interface EvaluationResult {
  value: boolean
  reason: EvaluationReason
  /** Index of the targeting rule that matched, when `reason` is TARGETING_MATCH or SPLIT via a rule. */
  ruleIndex?: number
}

/**
 * Storage contract — the "bring your own DB" seam. Any key/value store fits: a key maps
 * to one flag's JSON. Implement these four methods and the server never knows the difference.
 */
export interface StorageAdapter {
  get(key: string): Promise<FeatureFlag | null>
  put(key: string, flag: FeatureFlag): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<FeatureFlag[]>
}

/** The authenticated caller, extracted from a validated admin token. */
export interface AuthContext {
  identity: string
  groups: string[]
}

/**
 * Auth contract for the admin/write path. Returns the caller's identity on success, or
 * null when the token is missing/invalid. Group checks are layered on top by the server.
 */
export interface AuthVerifier {
  verify(token: string | null): Promise<AuthContext | null>
}
