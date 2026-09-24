/**
 * Admin roles, lowest to highest. Roles are hierarchical: each one can do everything the roles
 * below it can.
 */
export const ROLES = ['viewer', 'editor', 'admin', 'owner'] as const
export type Role = (typeof ROLES)[number]

/** Something an admin request can do. Each admin route requires exactly one. */
export type Permission =
  | 'flags:read'
  | 'flags:write'
  | 'flags:delete'
  | 'flags:import'
  | 'audit:read'
  | 'audit:security'
  | 'webhooks:manage'

/**
 * The lowest role that holds each permission. Webhooks sit at admin, not editor: an endpoint
 * receives every flag change and its signing secret is readable through the API, so managing one
 * is closer to granting access than to editing a flag. The security log sits at admin too, since
 * it lists every email that tried to sign in and where from.
 */
const MINIMUM_ROLE: Record<Permission, Role> = {
  'flags:read': 'viewer',
  'audit:read': 'viewer',
  'flags:write': 'editor',
  'flags:delete': 'admin',
  'flags:import': 'admin',
  'audit:security': 'admin',
  'webhooks:manage': 'admin',
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function minimumRole(permission: Permission): Role {
  return MINIMUM_ROLE[permission]
}

/** Whether `role` holds `permission`. Anything that is not a known role holds nothing. */
export function can(role: unknown, permission: Permission): boolean {
  if (!isRole(role)) return false
  return ROLES.indexOf(role) >= ROLES.indexOf(MINIMUM_ROLE[permission])
}
