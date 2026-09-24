import { describe, expect, it } from 'vitest'
import { assertRecordAddress, isValidCollectionName, isValidRecordId } from '../src/index'

describe('isValidCollectionName', () => {
  it('accepts lowercase names with digits and hyphens', () => {
    for (const name of ['users', 'users-email', 'login-attempts', 'a', 'v2-tokens']) {
      expect(isValidCollectionName(name), name).toBe(true)
    }
  })

  it('rejects anything that could collide with an adapter key layout', () => {
    for (const name of [
      '',
      'Users',
      'users:email',
      'users/email',
      'users email',
      '-users',
      '1users',
    ]) {
      expect(isValidCollectionName(name), JSON.stringify(name)).toBe(false)
    }
  })

  it('caps the length at 64', () => {
    expect(isValidCollectionName('a'.repeat(64))).toBe(true)
    expect(isValidCollectionName('a'.repeat(65))).toBe(false)
  })
})

describe('isValidRecordId', () => {
  it('accepts printable ids, including separators and email punctuation', () => {
    for (const id of ['u1', 'ada+test@example.com', 'a:b:c', 'path/like', 'with space', 'é']) {
      expect(isValidRecordId(id), id).toBe(true)
    }
  })

  it('rejects empty ids and control characters', () => {
    for (const id of ['', 'a\nb', 'a\tb', 'a\u0000b', 'a\u007fb']) {
      expect(isValidRecordId(id), JSON.stringify(id)).toBe(false)
    }
  })

  it('measures the 256 limit in UTF-8 bytes, not characters', () => {
    expect(isValidRecordId('a'.repeat(256))).toBe(true)
    expect(isValidRecordId('a'.repeat(257))).toBe(false)
    // 'é' is two bytes: 128 of them fit exactly, 129 do not.
    expect(isValidRecordId('é'.repeat(128))).toBe(true)
    expect(isValidRecordId('é'.repeat(129))).toBe(false)
  })
})

describe('assertRecordAddress', () => {
  it('passes valid addresses, with or without an id', () => {
    expect(() => assertRecordAddress('users')).not.toThrow()
    expect(() => assertRecordAddress('users', 'u1')).not.toThrow()
  })

  it('names what is wrong', () => {
    expect(() => assertRecordAddress('Users', 'u1')).toThrow(/collection/)
    expect(() => assertRecordAddress('users', '')).toThrow(/record id/)
  })
})
