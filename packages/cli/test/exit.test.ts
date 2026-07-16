import { memoryAdapter } from '@flaghoist/adapter-memory'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js')

let server: Server
let port: number

beforeAll(async () => {
  if (!existsSync(BIN)) {
    throw new Error(`CLI binary not built at ${BIN} — run \`pnpm --filter flaghoist build\` first`)
  }
  const app = createFlagServer({
    storage: memoryAdapter(),
    auth: { admin: bearerToken('t'), read: apiKey('r') },
  })
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', async () => {
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      })
      const response = await app.fetch(request)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(await response.text())
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(() => {
  server.closeAllConnections?.()
  server.close()
})

/** Run the compiled CLI as a child process; rejects if it does not exit within the timeout. */
function runCli(args: string[], timeoutMs = 8000): Promise<{ code: number | null; ms: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const child = spawn('node', [BIN, ...args], {
      env: { ...process.env, FLAGS_URL: `http://localhost:${port}`, FLAGS_ADMIN_TOKEN: 't' },
      stdio: 'ignore',
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`CLI did not exit within ${timeoutMs}ms — it hung on \`${args.join(' ')}\``))
    }, timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, ms: Date.now() - start })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe('CLI exits promptly (regression guard for the undici keep-alive hang)', () => {
  it('exits after a command that makes a successful fetch', async () => {
    // `flag list` is the exact path that previously hung on a lingering keep-alive socket.
    const created = await runCli(['flag', 'create', 'guard', '--on'])
    expect(created.code).toBe(0)

    const listed = await runCli(['flag', 'list'])
    expect(listed.code).toBe(0)
    expect(listed.ms).toBeLessThan(5000)
  })

  it('exits on a command with no network (no server involved)', async () => {
    const { code } = await runCli(['--version'])
    expect(code).toBe(0)
  })
})
