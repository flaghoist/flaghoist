import { memoryAdapter } from '@flaghoist/adapter-memory'
import { ApiError, createAdminClient, createAuthClient } from '@flaghoist/admin-client'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { describe, expect, it } from 'vitest'

const ADMIN_TOKEN = 'break-glass-token-for-tests-0123456789'
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
  return { auth: createAuthClient({ url: URL, fetch }), admin }
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

    const signedIn = await auth.signIn('ada@example.com', 'correct horse battery')
    const client = admin(signedIn.token)
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
