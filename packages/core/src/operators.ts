import type {
  AttributeValue,
  Condition,
  ConditionValue,
  EvaluationContext,
  Operator,
} from './types'

function isScalar(v: ConditionValue): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

function compareNumbers(
  a: AttributeValue,
  v: ConditionValue,
  test: (x: number, y: number) => boolean,
): boolean {
  const x = Number(a)
  const y = Number(v)
  if (Number.isNaN(x) || Number.isNaN(y)) return false
  return test(x, y)
}

interface ParsedSemver {
  major: number
  minor: number
  patch: number
  pre: string
}

function toInt(part: string | undefined): number {
  const n = parseInt(part ?? '', 10)
  return Number.isNaN(n) ? 0 : n
}

function parseSemver(v: string): ParsedSemver {
  const clean = v.trim().replace(/^v/, '')
  const dash = clean.indexOf('-')
  const core = dash === -1 ? clean : clean.slice(0, dash)
  const pre = dash === -1 ? '' : clean.slice(dash + 1)
  const [major, minor, patch] = core.split('.')
  return { major: toInt(major), minor: toInt(minor), patch: toInt(patch), pre }
}

/**
 * Compare two semver strings. Returns -1, 0, or 1. A version with no prerelease outranks
 * one with a prerelease (1.0.0 > 1.0.0-rc.1); prereleases are otherwise compared lexically.
 */
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a)
  const y = parseSemver(b)
  if (x.major !== y.major) return x.major < y.major ? -1 : 1
  if (x.minor !== y.minor) return x.minor < y.minor ? -1 : 1
  if (x.patch !== y.patch) return x.patch < y.patch ? -1 : 1
  if (x.pre === y.pre) return 0
  if (x.pre === '') return 1
  if (y.pre === '') return -1
  return x.pre < y.pre ? -1 : 1
}

function compareSemvers(
  a: AttributeValue,
  v: ConditionValue,
  test: (cmp: number) => boolean,
): boolean {
  if (typeof a !== 'string' || typeof v !== 'string') return false
  return test(compareSemver(a, v))
}

const operators: Record<Operator, (attr: AttributeValue, value: ConditionValue) => boolean> = {
  eq: (a, v) => isScalar(v) && a === v,
  neq: (a, v) => isScalar(v) && a !== v,
  in: (a, v) => Array.isArray(v) && v.some((item) => item === a),
  notIn: (a, v) => Array.isArray(v) && !v.some((item) => item === a),
  contains: (a, v) => typeof a === 'string' && typeof v === 'string' && a.includes(v),
  startsWith: (a, v) => typeof a === 'string' && typeof v === 'string' && a.startsWith(v),
  endsWith: (a, v) => typeof a === 'string' && typeof v === 'string' && a.endsWith(v),
  gt: (a, v) => compareNumbers(a, v, (x, y) => x > y),
  gte: (a, v) => compareNumbers(a, v, (x, y) => x >= y),
  lt: (a, v) => compareNumbers(a, v, (x, y) => x < y),
  lte: (a, v) => compareNumbers(a, v, (x, y) => x <= y),
  semverGte: (a, v) => compareSemvers(a, v, (cmp) => cmp >= 0),
  semverLt: (a, v) => compareSemvers(a, v, (cmp) => cmp < 0),
}

/**
 * Evaluate a single condition against the context. A referenced attribute that is absent
 * from the context never matches — you cannot target on data you were not given.
 */
export function matchCondition(condition: Condition, context: EvaluationContext): boolean {
  const attr = context[condition.attribute]
  if (attr === undefined) return false
  const op = operators[condition.operator]
  if (!op) return false
  return op(attr, condition.value)
}

/** True when every condition matches (logical AND). An empty list matches everyone. */
export function matchesAllConditions(conditions: Condition[], context: EvaluationContext): boolean {
  return conditions.every((condition) => matchCondition(condition, context))
}
