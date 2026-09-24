import { PassThrough, Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readPassword } from '../src/prompt'

describe('reading a password', () => {
  it('fails at once when there is no terminal and no --password-stdin', async () => {
    const input = Readable.from([]) as Readable & { isTTY?: boolean }
    input.isTTY = false
    await expect(
      readPassword({ fromStdin: false, input, output: new PassThrough() }),
    ).rejects.toThrow(/No terminal to ask for a password in/)
  })

  it('reads a piped password with --password-stdin, dropping the trailing newline', async () => {
    const input = Readable.from([Buffer.from('correct horse battery\n')])
    expect(await readPassword({ fromStdin: true, input, output: new PassThrough() })).toBe(
      'correct horse battery',
    )
  })

  it('refuses an empty pipe', async () => {
    const input = Readable.from([])
    await expect(
      readPassword({ fromStdin: true, input, output: new PassThrough() }),
    ).rejects.toThrow(/nothing was piped in/)
  })
})
