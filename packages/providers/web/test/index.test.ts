import { OFREPWebProvider } from '@openfeature/ofrep-web-provider'
import { describe, expect, it } from 'vitest'
import { FlaghoistWebProvider } from '../src/index'

describe('FlaghoistWebProvider', () => {
  it('constructs as an OFREP web provider with provider metadata', () => {
    const provider = new FlaghoistWebProvider({
      url: 'https://flags.example.com',
      apiKey: 'read-key',
    })
    expect(provider).toBeInstanceOf(OFREPWebProvider)
    expect(typeof provider.metadata.name).toBe('string')
  })
})
