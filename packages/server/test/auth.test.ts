import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { apiKey, bearerToken, oidc } from '../src/auth'

describe('apiKey', () => {
  const auth = apiKey('read-secret')

  it('accepts the correct key', async () => {
    expect(await auth(new Headers({ 'x-api-key': 'read-secret' }))).toMatchObject({
      ok: true,
      identity: 'api-key',
    })
  })

  it('rejects a missing or wrong key with 401', async () => {
    expect(await auth(new Headers())).toMatchObject({ ok: false, status: 401 })
    expect(await auth(new Headers({ 'x-api-key': 'wrong' }))).toMatchObject({
      ok: false,
      status: 401,
    })
  })
})

describe('bearerToken', () => {
  const auth = bearerToken('admin-secret')

  it('accepts a correct bearer token', async () => {
    expect(await auth(new Headers({ authorization: 'Bearer admin-secret' }))).toMatchObject({
      ok: true,
      identity: 'admin',
    })
  })

  it('rejects a wrong scheme, wrong token, or no header', async () => {
    expect(await auth(new Headers({ authorization: 'admin-secret' }))).toMatchObject({ ok: false })
    expect(await auth(new Headers({ authorization: 'Bearer nope' }))).toMatchObject({
      ok: false,
      status: 401,
    })
    expect(await auth(new Headers())).toMatchObject({ ok: false, status: 401 })
  })
})

describe('oidc', () => {
  const ISSUER = 'https://issuer.example.com'
  const AUDIENCE = 'client-123'

  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
    const jwk = await exportJWK(publicKey)
    jwk.kid = 'test-key'
    jwk.alg = 'RS256'
    const keyResolver = createLocalJWKSet({ keys: [jwk] })
    return { privateKey, keyResolver }
  }

  function token(key: Parameters<SignJWT['sign']>[0], claims: Record<string, unknown>, exp = '5m') {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(exp)
      .sign(key)
  }

  it('accepts a valid token in an allowed group and extracts the email identity', async () => {
    const { privateKey, keyResolver } = await setup()
    const jwt = await token(privateKey, { email: 'ada@acme.com', 'cognito:groups': ['ADMIN'] })
    const auth = oidc({
      issuer: ISSUER,
      audience: AUDIENCE,
      groupsClaim: 'cognito:groups',
      allowedGroups: ['ADMIN'],
      keyResolver,
    })
    expect(await auth(new Headers({ authorization: `Bearer ${jwt}` }))).toMatchObject({
      ok: true,
      identity: 'ada@acme.com',
    })
  })

  it('rejects a valid token whose group is not allowed with 403', async () => {
    const { privateKey, keyResolver } = await setup()
    const jwt = await token(privateKey, { email: 'x@y.com', 'cognito:groups': ['USER'] })
    const auth = oidc({
      issuer: ISSUER,
      audience: AUDIENCE,
      groupsClaim: 'cognito:groups',
      allowedGroups: ['ADMIN'],
      keyResolver,
    })
    expect(await auth(new Headers({ authorization: `Bearer ${jwt}` }))).toMatchObject({
      ok: false,
      status: 403,
    })
  })

  it('rejects a wrong audience with 401', async () => {
    const { privateKey, keyResolver } = await setup()
    const jwt = await new SignJWT({ email: 'x@y.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience('other-client')
      .setExpirationTime('5m')
      .sign(privateKey)
    const auth = oidc({ issuer: ISSUER, audience: AUDIENCE, keyResolver })
    expect(await auth(new Headers({ authorization: `Bearer ${jwt}` }))).toMatchObject({
      ok: false,
      status: 401,
    })
  })

  it('rejects an expired token with 401', async () => {
    const { privateKey, keyResolver } = await setup()
    const jwt = await token(privateKey, { email: 'x@y.com' }, '-1m')
    const auth = oidc({ issuer: ISSUER, audience: AUDIENCE, keyResolver })
    expect(await auth(new Headers({ authorization: `Bearer ${jwt}` }))).toMatchObject({
      ok: false,
      status: 401,
    })
  })

  it('enforces token_use when configured', async () => {
    const { privateKey, keyResolver } = await setup()
    const jwt = await token(privateKey, { email: 'x@y.com', token_use: 'access' })
    const auth = oidc({ issuer: ISSUER, audience: AUDIENCE, tokenUse: 'id', keyResolver })
    expect(await auth(new Headers({ authorization: `Bearer ${jwt}` }))).toMatchObject({
      ok: false,
      status: 401,
    })
  })

  it('rejects a missing bearer token with 401 before any network call', async () => {
    const auth = oidc({
      issuer: ISSUER,
      audience: AUDIENCE,
      keyResolver: createLocalJWKSet({ keys: [] }),
    })
    expect(await auth(new Headers())).toMatchObject({
      ok: false,
      status: 401,
      message: 'Missing bearer token',
    })
  })
})
