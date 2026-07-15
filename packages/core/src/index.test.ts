import { describe, expect, it } from 'vitest'
import { version } from './index'

describe('@flaghoist/core', () => {
  it('exposes a package version', () => {
    expect(version).toBe('0.0.0')
  })
})
