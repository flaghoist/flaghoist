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
  archived?: boolean
  archivedAt?: string
  /**
   * The environment this flag belongs to, when the server has environments configured. Absent
   * means the default environment ("production"), so existing bare-keyed flags need no migration
   * when environments are turned on for the first time.
   */
  environment?: string
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

  /** Append an audit entry to persistent storage. Optional; the server falls back to in-memory. */
  appendAudit?(entry: AuditEntry): Promise<void>
  /** List audit entries with optional filtering and pagination. */
  listAudit?(options?: AuditListOptions): Promise<AuditPage>

  /** Store a webhook endpoint. Optional; the server falls back to in-memory. */
  putWebhook?(id: string, webhook: WebhookEndpoint): Promise<void>
  /** Retrieve a webhook by id. */
  getWebhook?(id: string): Promise<WebhookEndpoint | null>
  /** Remove a webhook. */
  deleteWebhook?(id: string): Promise<void>
  /** List all webhook endpoints. */
  listWebhooks?(): Promise<WebhookEndpoint[]>

  /**
   * Generic record store: JSON values grouped into named collections, addressed by id. Optional.
   * Features that need persistent server-side state beyond flags build on this rather than adding
   * a new method group to every adapter. Collection names must pass `isValidCollectionName` and
   * ids `isValidRecordId`; values must be JSON-serializable.
   */
  getRecord?(collection: string, id: string): Promise<unknown | null>
  /** Create or replace a record. */
  putRecord?(collection: string, id: string, value: unknown): Promise<void>
  /** Remove a record. Removing a missing record is a no-op. */
  deleteRecord?(collection: string, id: string): Promise<void>
  /** List every record in one collection, in no particular order. */
  listRecords?(collection: string): Promise<RecordEntry[]>
}

/** One record returned by `StorageAdapter.listRecords`. */
export interface RecordEntry {
  id: string
  value: unknown
}

/** A point-in-time snapshot of a flag's evaluable state, recorded in audit entries. */
export interface FlagSnapshot {
  enabled: boolean
  rollout: { percentage: number }
  description: string
}

/** Actions recorded against a flag. */
export type FlagAuditAction = 'create' | 'update' | 'delete' | 'archive' | 'restore'

/**
 * Actions recorded against accounts, sessions and webhooks. These never carry a `flagKey`; they
 * name what they touched in `target` instead.
 */
export type SecurityAuditAction =
  | 'login'
  | 'login.failed'
  | 'logout'
  | 'password.changed'
  | 'session.revoked'
  | 'password.reset'
  | 'user.created'
  | 'user.updated'
  | 'user.removed'
  | 'invite.created'
  | 'invite.accepted'
  | 'invite.revoked'
  | 'token.created'
  | 'token.revoked'
  | 'token.expired'
  | 'two_factor.enabled'
  | 'two_factor.disabled'
  | 'two_factor.reset'
  | 'two_factor.recovery_used'
  | 'webhook.created'
  | 'webhook.updated'
  | 'webhook.deleted'

export type AuditAction = FlagAuditAction | SecurityAuditAction

export const FLAG_AUDIT_ACTIONS: readonly FlagAuditAction[] = [
  'create',
  'update',
  'delete',
  'archive',
  'restore',
]

/** Which log an entry belongs to: flag changes, or sign-ins and configuration changes. */
export type AuditCategory = 'flags' | 'security'

export function auditCategory(action: AuditAction): AuditCategory {
  return (FLAG_AUDIT_ACTIONS as readonly string[]).includes(action) ? 'flags' : 'security'
}

/** What a security event touched. */
export interface AuditTarget {
  type: 'user' | 'session' | 'invite' | 'token' | 'webhook'
  id: string
}

export interface AuditEntry {
  id: string
  timestamp: string
  action: AuditAction
  /** The flag that changed. Always set on flag events; absent on security events. */
  flagKey?: string
  /** What a security event touched. Absent on flag events. */
  target?: AuditTarget
  actor: string
  previous?: FlagSnapshot
  current?: FlagSnapshot
  /** A note on the change: the author's description on flag events, context on security events. */
  changeDescription?: string
  /** The environment the change happened in. Absent means the default environment. */
  environment?: string
}

export interface AuditListOptions {
  limit?: number
  offset?: number
  /**
   * Which log to read. Adapters that persist audit entries should honour this; `auditCategory()`
   * maps an action onto its category. Absent means both.
   */
  category?: AuditCategory
  flagKey?: string
  action?: AuditAction
  /** Restrict to entries recorded in this environment. Absent means the default environment. */
  environment?: string
}

export interface AuditPage {
  entries: AuditEntry[]
  total: number
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type FlagWebhookEvent =
  'flag.created' | 'flag.updated' | 'flag.deleted' | 'flag.archived' | 'flag.restored'

/**
 * Team changes, for servers with user accounts. Opt-in: a webhook gets them only when it lists
 * them, never through the default event list, so a receiver built for flag events never sees a
 * payload of another shape.
 */
export type MemberWebhookEvent =
  | 'member.invited'
  | 'member.joined'
  | 'member.role_changed'
  | 'member.disabled'
  | 'member.enabled'
  | 'member.removed'

export type WebhookEvent = FlagWebhookEvent | MemberWebhookEvent

/** The flag events: what a webhook subscribes to when it names no events. */
export const WEBHOOK_EVENTS: FlagWebhookEvent[] = [
  'flag.created',
  'flag.updated',
  'flag.deleted',
  'flag.archived',
  'flag.restored',
]

export const MEMBER_WEBHOOK_EVENTS: MemberWebhookEvent[] = [
  'member.invited',
  'member.joined',
  'member.role_changed',
  'member.disabled',
  'member.enabled',
  'member.removed',
]

export interface WebhookEndpoint {
  id: string
  url: string
  secret: string
  events: WebhookEvent[]
  enabled: boolean
  createdAt: string
  updatedAt: string
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
