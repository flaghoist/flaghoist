import { inviteLink, type AdminClient, type Member } from '@flaghoist/admin-client'

const ROLES = ['viewer', 'editor', 'admin', 'owner']

export const USERS_USAGE = `  users list
  users invite <email> [--role viewer|editor|admin|owner]
  users role <email> <role>
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
  options: { role?: string },
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
      const { token, invite } = await client.createInvite({ email: a, role })
      return [
        `Invited ${invite.email} as ${invite.role}. Send them this link (valid until ${when(invite.expiresAt)}):`,
        inviteLink(dashboard, token),
      ]
    }
    case 'role': {
      if (!a || !b) throw new Error('Usage: flaghoist users role <email> <role>')
      const member = await memberByEmail(client, a)
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
      const { token, invite } = await client.createResetLink(member.id)
      return [
        `Send ${member.email} this link to set a new password (valid until ${when(invite.expiresAt)}):`,
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
