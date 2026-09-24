import {
  createAdminClient,
  createAuthClient,
  type AccessToken,
  type AdminClient,
  type AdminClientOptions,
} from '@flaghoist/admin-client'

const ROLES = ['viewer', 'editor', 'admin', 'owner']

export const TOKENS_USAGE = `  tokens list
  tokens create <name> [--role <role>] [--expires-days N|never]
  tokens revoke <id or name>`

function when(iso?: string): string {
  return iso ? iso.slice(0, 10) : 'never'
}

function parseExpiry(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined
  if (value === 'never') return null
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error('--expires-days must be a whole number from 1 to 3650, or "never".')
  }
  return days
}

function findToken(tokens: AccessToken[], ref: string): AccessToken {
  const byId = tokens.find((t) => t.id === ref)
  if (byId) return byId
  const byName = tokens.filter((t) => t.name === ref)
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1) throw new Error(`More than one token is named "${ref}". Use its id.`)
  throw new Error(`No token with the id or name "${ref}".`)
}

/** `flaghoist tokens ...`. Returns the lines to print, so it can be tested without a terminal. */
export async function runTokens(
  client: AdminClient,
  positionals: string[],
  options: { role?: string; expiresDays?: string },
): Promise<string[]> {
  const [sub, a] = positionals
  switch (sub) {
    case 'list': {
      const tokens = await client.listTokens()
      if (tokens.length === 0) return ['No access tokens.']
      return tokens.map(
        (t) =>
          `${t.id}  ${t.name.padEnd(24)} ${t.role.padEnd(7)} ${t.prefix}...  expires ${when(
            t.expiresAt,
          )}  last used ${when(t.lastUsedAt)}`,
      )
    }
    case 'create': {
      if (!a) throw new Error('Usage: flaghoist tokens create <name> [--role r] [--expires-days N]')
      if (options.role && !ROLES.includes(options.role)) {
        throw new Error(`Role must be one of ${ROLES.join(', ')}.`)
      }
      const { token, info } = await client.createToken({
        name: a,
        ...(options.role ? { role: options.role } : {}),
        ...(options.expiresDays !== undefined
          ? { expiresInDays: parseExpiry(options.expiresDays) }
          : {}),
      })
      return [
        `Created "${info.name}" (${info.role}, expires ${when(info.expiresAt)}). Copy it now; it is not shown again:`,
        token,
      ]
    }
    case 'revoke': {
      if (!a) throw new Error('Usage: flaghoist tokens revoke <id or name>')
      const token = findToken(await client.listTokens(), a)
      await client.revokeToken(token.id)
      return [`Revoked "${token.name}".`]
    }
    default:
      throw new Error(`Unknown tokens command: ${sub ?? '(none)'}. Try "flaghoist tokens list".`)
  }
}

/**
 * Sign in with an email and password and swap the short session for a personal access token the
 * CLI can keep. The password is stretched locally and never sent; the session is ended straight
 * away, so only the named, revocable token remains.
 */
export async function loginForToken(input: {
  url: string
  email: string
  password: string
  tokenName: string
  fetch?: AdminClientOptions['fetch']
}): Promise<{ token: string; tokenId: string; email: string; role: string; expiresAt?: string }> {
  const auth = createAuthClient({ url: input.url, fetch: input.fetch })
  const config = await auth.config()
  if (!config.accounts) {
    throw new Error(
      'This server has no user accounts. Use its admin token with --token or FLAGS_ADMIN_TOKEN.',
    )
  }
  const signedIn = await auth.signIn(input.email, input.password)
  const session = createAdminClient({ url: input.url, token: signedIn.token, fetch: input.fetch })
  try {
    const { token, info } = await session.createToken({ name: input.tokenName })
    return {
      token,
      tokenId: info.id,
      email: signedIn.user.email,
      role: info.role,
      expiresAt: info.expiresAt,
    }
  } finally {
    await session.logout().catch(() => {})
  }
}
