import { memoryAdapter } from '@flaghoist/adapter-memory'
import {
  ApiError,
  createAdminClient,
  createAuthClient,
  isTwoFactorChallenge,
} from '@flaghoist/admin-client'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { loginForToken, runTokens } from '../src/tokens'
import { runUsers } from '../src/users'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'

/** The session token from a sign-in that needs no second step. */
function tokenOf(result: Awaited<ReturnType<ReturnType<typeof createAuthClient>['signIn']>>) {
  if (isTwoFactorChallenge(result)) throw new Error('unexpected two-factor challenge')
  return result.token
}

/** The current six-digit code for a base32 secret (RFC 6238, SHA-1, 30 seconds). */
function totpNow(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of secret) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const mac = createHmac('sha1', key).update(counter).digest()
  const offset = mac[mac.length - 1]! & 15
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
const URL = 'http://flaghoist.local'

// End to end through the real client: PBKDF2 at full strength in the client, HMAC on the server.
function setup(withUsers = true) {
  const app = createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read-key-for-tests-0123') },
    ...(withUsers ? { users: { pepper: 'pepper-for-tests-0123456789abcdef0123456789' } } : {}),
  })
  const fetch = async (input: string, init?: RequestInit) => app.request(input, init)
  const admin = (token: string) => createAdminClient({ url: URL, token, fetch })
  return { auth: createAuthClient({ url: URL, fetch }), admin, fetch }
}

describe('accounts through the admin client', () => {
  it('reports no accounts on a server without them', async () => {
    const { auth } = setup(false)
    expect(await auth.config()).toEqual({ accounts: false })
  })

  it('creates the first owner, signs in, changes the password and signs out', async () => {
    const { auth, admin } = setup()
    expect((await auth.config()).setupRequired).toBe(true)

    const owner = await admin(ADMIN_TOKEN).createOwner({
      email: 'ada@example.com',
      name: 'Ada',
      password: 'correct horse battery',
    })
    expect(owner).toMatchObject({ email: 'ada@example.com', role: 'owner' })

    const client = admin(tokenOf(await auth.signIn('ada@example.com', 'correct horse battery')))
    expect((await client.me()).user?.email).toBe('ada@example.com')

    await client.changePassword({
      email: 'ada@example.com',
      currentPassword: 'correct horse battery',
      newPassword: 'a different long passphrase',
    })
    const wrong = await auth
      .signIn('ada@example.com', 'correct horse battery')
      .catch((e: unknown) => e)
    expect(wrong).toBeInstanceOf(ApiError)
    expect((wrong as ApiError).status).toBe(401)
    await auth.signIn('ada@example.com', 'a different long passphrase')

    expect((await client.listSessions()).length).toBe(2)
    expect(await client.revokeOtherSessions()).toEqual({ revoked: 1 })

    await client.logout()
    const after = await client.list().catch((e: unknown) => e)
    expect((after as ApiError).code).toBe('session_expired')
  })

  it('normalises the password, so the same text typed two ways signs in', async () => {
    const { auth, admin } = setup()
    // "é" as one code point when set, as "e" plus a combining accent when typed.
    await admin(ADMIN_TOKEN).createOwner({ email: 'e@example.com', password: 'café au lait 42' })
    await expect(auth.signIn('e@example.com', 'café au lait 42')).resolves.toBeTruthy()
  })
})

describe('flaghoist users', () => {
  it('invites, lists, changes a role, resets, disables and removes', async () => {
    const { auth, admin } = setup()
    const owner = admin(ADMIN_TOKEN)
    const [message, link] = await runUsers(owner, URL, ['invite', 'ed@example.com'], {
      role: 'editor',
    })
    expect(message).toMatch(/^Invited ed@example.com as editor/)
    expect(link).toMatch(/^http:\/\/flaghoist\.local\/admin\/#accept=fh_inv_/)

    const token = decodeURIComponent(link!.split('#accept=')[1]!)
    expect(await auth.inspectLink(token)).toMatchObject({ kind: 'invite', role: 'editor' })
    await auth.acceptLink(token, { name: 'Ed', password: 'correct horse battery' })

    const list = await runUsers(owner, URL, ['list'], {})
    expect(list[0]).toMatch(/^ed@example.com\s+editor\s+active/)

    expect(await runUsers(owner, URL, ['role', 'ed@example.com', 'admin'], {})).toEqual([
      'ed@example.com is now admin.',
    ])

    const [, resetLink] = await runUsers(owner, URL, ['reset', 'ed@example.com'], {})
    const resetToken = decodeURIComponent(resetLink!.split('#accept=')[1]!)
    await auth.acceptLink(resetToken, { password: 'a brand new passphrase' })
    await auth.signIn('ed@example.com', 'a brand new passphrase')

    await runUsers(owner, URL, ['disable', 'ed@example.com'], {})
    const refused = await auth
      .signIn('ed@example.com', 'a brand new passphrase')
      .catch((e: unknown) => e)
    expect((refused as ApiError).status).toBe(401)

    await runUsers(owner, URL, ['remove', 'ed@example.com'], {})
    expect(await runUsers(owner, URL, ['list'], {})).toEqual(['No members yet.'])
  })

  it('cancels an open invite', async () => {
    const { auth, admin } = setup()
    const owner = admin(ADMIN_TOKEN)
    const [, link] = await runUsers(owner, URL, ['invite', 'v@example.com'], {})
    await runUsers(owner, URL, ['revoke', 'v@example.com'], {})
    const token = decodeURIComponent(link!.split('#accept=')[1]!)
    const gone = await auth.inspectLink(token).catch((e: unknown) => e)
    expect((gone as ApiError).status).toBe(410)
  })

  it('rejects an unknown role before calling the server', async () => {
    const { admin } = setup()
    await expect(
      runUsers(admin(ADMIN_TOKEN), URL, ['invite', 'x@example.com'], { role: 'superuser' }),
    ).rejects.toThrow(/Role must be one of/)
  })
})

describe('flaghoist login and tokens', () => {
  it('swaps a password for a saved access token and ends the session', async () => {
    const { auth, admin, fetch } = setup()
    await admin(ADMIN_TOKEN).createOwner({
      email: 'ada@example.com',
      password: 'correct horse battery',
    })
    const result = await loginForToken({
      url: URL,
      email: 'ada@example.com',
      password: 'correct horse battery',
      tokenName: 'flaghoist CLI on test',
      fetch,
    })
    expect(result.token.startsWith('fh_pat_')).toBe(true)
    expect(result.role).toBe('owner')
    const client = admin(result.token)
    expect((await client.me()).token?.name).toBe('flaghoist CLI on test')
    // Only the token remains: the session used to create it is already gone.
    const signedIn = tokenOf(await auth.signIn('ada@example.com', 'correct horse battery'))
    const sessions = await admin(signedIn).listSessions()
    expect(sessions).toHaveLength(1)
  })

  it('refuses a server without accounts', async () => {
    const { fetch } = setup(false)
    await expect(
      loginForToken({ url: URL, email: 'a@example.com', password: 'x', tokenName: 't', fetch }),
    ).rejects.toThrow(/no user accounts/)
  })

  it('creates, lists and revokes tokens', async () => {
    const { auth, admin } = setup()
    await admin(ADMIN_TOKEN).createOwner({
      email: 'ada@example.com',
      password: 'correct horse battery',
    })
    const session = admin(tokenOf(await auth.signIn('ada@example.com', 'correct horse battery')))
    const [message, token] = await runTokens(session, ['create', 'deploys'], {
      role: 'viewer',
      expiresDays: '30',
    })
    expect(message).toMatch(/^Created "deploys" \(viewer, expires \d{4}-\d{2}-\d{2}\)/)
    expect(token).toMatch(/^fh_pat_/)
    const list = await runTokens(session, ['list'], {})
    expect(list[0]).toMatch(/deploys\s+viewer/)
    expect(await runTokens(session, ['revoke', 'deploys'], {})).toEqual(['Revoked "deploys".'])
    expect(await runTokens(session, ['list'], {})).toEqual(['No access tokens.'])
    await expect(runTokens(session, ['create', 'x'], { expiresDays: 'soon' })).rejects.toThrow(
      /--expires-days/,
    )
  })
})

describe('flaghoist login with two-factor', () => {
  it('asks for the code when the account uses one', async () => {
    const { auth, admin, fetch } = setup()
    await admin(ADMIN_TOKEN).createOwner({
      email: 'ada@example.com',
      password: 'correct horse battery',
    })
    const session = admin(tokenOf(await auth.signIn('ada@example.com', 'correct horse battery')))
    const { secret } = await session.beginTwoFactor()
    const recovery = await session.confirmTwoFactor(totpNow(secret))

    await expect(
      loginForToken({
        url: URL,
        email: 'ada@example.com',
        password: 'correct horse battery',
        tokenName: 't',
        fetch,
      }),
    ).rejects.toThrow(/--code/)

    const asked: string[] = []
    const result = await loginForToken({
      url: URL,
      email: 'ada@example.com',
      password: 'correct horse battery',
      tokenName: 't',
      fetch,
      twoFactorCode: async () => {
        asked.push('code')
        return recovery[0]!
      },
    })
    expect(asked).toEqual(['code'])
    expect(result.token.startsWith('fh_pat_')).toBe(true)
  })
})
