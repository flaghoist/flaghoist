import { OFREPProvider } from '@openfeature/ofrep-provider'
import { describe, expect, it } from 'vitest'
import { FlaghoistProvider } from '../src/index'

describe('FlaghoistProvider', () => {
  it('constructs as an OFREP provider with provider metadata', () => {
    const provider = new FlaghoistProvider({ url: 'https://flags.example.com', apiKey: 'read-key' })
    expect(provider).toBeInstanceOf(OFREPProvider)
    expect(typeof provider.metadata.name).toBe('string')
  })
})
