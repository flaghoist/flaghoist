import { createInterface } from 'node:readline/promises'
import type { Readable, Writable } from 'node:stream'

type Input = Readable & { isTTY?: boolean }

/**
 * Get a password: from stdin when `fromStdin` is set (`--password-stdin`, for scripts), otherwise by
 * asking in the terminal without echoing it. With no terminal and no flag this fails at once rather
 * than waiting on input that will never come.
 */
export async function readPassword(options: {
  fromStdin: boolean
  input?: Input
  output?: Writable
}): Promise<string> {
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout

  if (options.fromStdin) {
    const chunks: Buffer[] = []
    for await (const chunk of input) chunks.push(Buffer.from(chunk as Buffer))
    const password = Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '')
    if (!password) throw new Error('--password-stdin was set but nothing was piped in.')
    return password
  }

  if (!input.isTTY) {
    throw new Error(
      'No terminal to ask for a password in. Run this in a terminal, or pipe the password in with ' +
        '--password-stdin.',
    )
  }

  const rl = createInterface({ input, output, terminal: true })
  output.write('Password: ')
  // Swallow readline's echo of each keystroke. The prompt itself was written above.
  ;(rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = () => {}
  try {
    return await rl.question('')
  } finally {
    rl.close()
    output.write('\n')
  }
}
