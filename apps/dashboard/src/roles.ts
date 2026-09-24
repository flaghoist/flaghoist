/**
 * The server's role table, mirrored so the dashboard can hide what a role cannot do. The server
 * enforces every check on its own; this only keeps the interface honest about what will work.
 */
export const ROLES = ['viewer', 'editor', 'admin', 'owner'] as const
export type Role = (typeof ROLES)[number]

export type Permission =
  | 'flags:write'
  | 'flags:delete'
  | 'flags:import'
  | 'audit:security'
  | 'webhooks:manage'
  | 'members:manage'

const MINIMUM: Record<Permission, Role> = {
  'flags:write': 'editor',
  'flags:delete': 'admin',
  'flags:import': 'admin',
  'audit:security': 'admin',
  'webhooks:manage': 'admin',
  'members:manage': 'admin',
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  const have = ROLES.indexOf(role as Role)
  return have >= 0 && have >= ROLES.indexOf(MINIMUM[permission])
}

/** The roles `role` may hand out: admins up to admin, owners any. */
export function assignableRoles(role: string | null | undefined): Role[] {
  return role === 'owner' ? [...ROLES] : ROLES.filter((r) => r !== 'owner')
}
