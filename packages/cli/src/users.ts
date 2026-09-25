import { inviteLink, type AdminClient, type Member } from '@flaghoist/admin-client'

const ROLES = ['viewer', 'editor', 'admin', 'owner']

export const USERS_USAGE = `  users list
  users invite <email> [--role viewer|editor|admin|owner]
  users role <email> <role> [--env E]   With --env, the role in one environment; "default" clears it
  users disable <email>
  users enable <email>
  users remove <email>
  users reset <email>        Print a link that sets a new password (valid 24 hours)
  users revoke <email>       Cancel an open invite`

async function memberByEmail(client: AdminClient, email: string): Promise<Member> {
  const wanted = email.trim().toLowerCase()
  const member = (await client.listMembers()).find((m) => m.email === wanted)
  if (!member) throw new Error(`No member with the email ${wanted}.`)
  return member
}

function requireRole(role: string | undefined): string {
  if (!role || !ROLES.includes(role)) throw new Error(`Role must be one of ${ROLES.join(', ')}.`)
  return role
}

function when(iso?: string): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : 'never'
}

/**
 * `flaghoist users ...`. Returns the lines to print, so it can be tested without a terminal. The
 * dashboard is assumed to be served by the server at `/admin`, which is where invite links point.
 */
export async function runUsers(
  client: AdminClient,
  serverUrl: string,
  positionals: string[],
  options: { role?: string; env?: string },
): Promise<string[]> {
  const [sub, a, b] = positionals
  const dashboard = `${serverUrl.replace(/\/+$/, '')}/admin/`

  switch (sub) {
    case 'list': {
      const [members, invites] = await Promise.all([client.listMembers(), client.listInvites()])
      const lines = members.map(
        (m) =>
          `${m.email.padEnd(32)} ${m.role.padEnd(8)} ${m.status.padEnd(9)} last active ${when(m.lastActiveAt)}`,
      )
      for (const i of invites) {
        lines.push(
          `${i.email.padEnd(32)} ${i.role.padEnd(8)} invited   expires ${when(i.expiresAt)}`,
        )
      }
      return lines.length > 0 ? lines : ['No members yet.']
    }
    case 'invite': {
      if (!a) throw new Error('Usage: flaghoist users invite <email> [--role viewer]')
      const role = requireRole(options.role ?? 'viewer')
      const { token, invite, emailed } = await client.createInvite({
        email: a,
        role,
        dashboardUrl: dashboard,
      })
      return [
        emailed
          ? `Invited ${invite.email} as ${invite.role} and emailed them the link (valid until ${when(invite.expiresAt)}):`
          : `Invited ${invite.email} as ${invite.role}. Send them this link (valid until ${when(invite.expiresAt)}):`,
        inviteLink(dashboard, token),
      ]
    }
    case 'role': {
      if (!a || !b) throw new Error('Usage: flaghoist users role <email> <role> [--env E]')
      const member = await memberByEmail(client, a)
      if (options.env) {
        const clear = b === 'default'
        if (!clear && (!ROLES.includes(b) || b === 'owner')) {
          throw new Error('An environment role must be viewer, editor or admin, or "default".')
        }
        const updated = await client.updateMember(member.id, {
          environmentRoles: { ...member.environmentRoles, [options.env]: clear ? null : b },
        })
        const now = updated.environmentRoles?.[options.env]
        return [
          now
            ? `${updated.email} is ${now} in ${options.env}.`
            : `${updated.email} has their main role (${updated.role}) in ${options.env}.`,
        ]
      }
      const updated = await client.updateMember(member.id, { role: requireRole(b) })
      return [`${updated.email} is now ${updated.role}.`]
    }
    case 'disable':
    case 'enable': {
      if (!a) throw new Error(`Usage: flaghoist users ${sub} <email>`)
      const member = await memberByEmail(client, a)
      const status = sub === 'disable' ? 'disabled' : 'active'
      await client.updateMember(member.id, { status })
      return [`${member.email} is ${sub === 'disable' ? 'disabled and signed out' : 'enabled'}.`]
    }
    case 'remove': {
      if (!a) throw new Error('Usage: flaghoist users remove <email>')
      const member = await memberByEmail(client, a)
      await client.removeMember(member.id)
      return [`Removed ${member.email}.`]
    }
    case 'reset': {
      if (!a) throw new Error('Usage: flaghoist users reset <email>')
      const member = await memberByEmail(client, a)
      const { token, invite, emailed } = await client.createResetLink(member.id, {
        dashboardUrl: dashboard,
      })
      return [
        emailed
          ? `Emailed ${member.email} a link to set a new password (valid until ${when(invite.expiresAt)}):`
          : `Send ${member.email} this link to set a new password (valid until ${when(invite.expiresAt)}):`,
        inviteLink(dashboard, token),
      ]
    }
    case 'revoke': {
      if (!a) throw new Error('Usage: flaghoist users revoke <email>')
      const wanted = a.trim().toLowerCase()
      const invite = (await client.listInvites()).find((i) => i.email === wanted)
      if (!invite) throw new Error(`No open invite for ${wanted}.`)
      await client.revokeInvite(invite.id)
      return [`Cancelled the invite for ${wanted}.`]
    }
    default:
      throw new Error(`Unknown users command: ${sub ?? '(none)'}. Try "flaghoist users list".`)
  }
}
