import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { memoryAdapter } from '@flaghoist/adapter-memory'
import { createFlag } from '@flaghoist/core'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMcpServer } from '../src/server.js'

const ADMIN_TOKEN = 'test-admin'

const seed = [
  createFlag({ key: 'checkout-v2', enabled: true, rollout: { percentage: 25 } }),
  createFlag({
    key: 'dark-mode',
    enabled: true,
    rollout: { percentage: 100 },
    description: 'Dark mode for all users',
  }),
  createFlag({
    key: 'beta',
    enabled: true,
    rollout: { percentage: 0 },
    rules: [
      {
        conditions: [{ attribute: 'plan', operator: 'eq' as const, value: 'beta' }],
        result: { enabled: true },
      },
    ],
  }),
]

const app = createFlagServer({
  storage: memoryAdapter(seed),
  auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey('read') },
})

let server: ReturnType<typeof createServer>
let baseUrl: string

beforeAll(async () => {
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
  const { port } = server.address() as AddressInfo
  baseUrl = `http://localhost:${port}`
})

afterAll(() => {
  server?.close()
})

async function connect(allowWrites: boolean) {
  const mcpServer = createMcpServer({
    url: baseUrl,
    token: ADMIN_TOKEN,
    allowWrites,
  })
  const client = new Client({ name: 'test', version: '0.0.1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([client.connect(clientTransport), mcpServer.connect(serverTransport)])
  return client
}

describe('read-only mode (default)', () => {
  it('lists all flags', async () => {
    const client = await connect(false)
    const result = await client.callTool({ name: 'list_flags', arguments: {} })
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('3 flag(s)')
    expect(text).toContain('checkout-v2')
    expect(text).toContain('dark-mode')
    expect(text).toContain('beta')
  })

  it('gets a single flag with detail', async () => {
    const client = await connect(false)
    const result = await client.callTool({ name: 'get_flag', arguments: { key: 'dark-mode' } })
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('key: dark-mode')
    expect(text).toContain('state: on')
    expect(text).toContain('rollout: 100%')
    expect(text).toContain('Dark mode for all users')
  })

  it('returns an error for a missing flag', async () => {
    const client = await connect(false)
    const result = await client.callTool({ name: 'get_flag', arguments: { key: 'nope' } })
    expect(result.isError).toBe(true)
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('not found')
  })

  it('does not expose write tools', async () => {
    const client = await connect(false)
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    expect(names).toContain('list_flags')
    expect(names).toContain('get_flag')
    expect(names).not.toContain('create_flag')
    expect(names).not.toContain('toggle_flag')
    expect(names).not.toContain('set_rollout')
    expect(names).not.toContain('set_targeting_rules')
  })
})

describe('write mode', () => {
  it('exposes all six tools', async () => {
    const client = await connect(true)
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'list_flags',
        'get_flag',
        'create_flag',
        'toggle_flag',
        'set_rollout',
        'set_targeting_rules',
      ]),
    )
  })

  it('creates a flag', async () => {
    const client = await connect(true)
    const result = await client.callTool({
      name: 'create_flag',
      arguments: { key: 'mcp-test-create', description: 'from MCP' },
    })
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('Created "mcp-test-create"')
    expect(text).toContain('disabled')
  })

  it('toggles a flag', async () => {
    const client = await connect(true)
    const result = await client.callTool({
      name: 'toggle_flag',
      arguments: { key: 'checkout-v2', enabled: false },
    })
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('"checkout-v2"')
    expect(text).toContain('disabled')
  })

  it('sets rollout', async () => {
    const client = await connect(true)
    const result = await client.callTool({
      name: 'set_rollout',
      arguments: { key: 'checkout-v2', percentage: 50 },
    })
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('50%')
  })

  it('sets targeting rules', async () => {
    const client = await connect(true)
    const result = await client.callTool({
      name: 'set_targeting_rules',
      arguments: {
        key: 'checkout-v2',
        rules: [
          {
            conditions: [{ attribute: 'country', operator: 'in', value: ['US', 'CA'] }],
            result: { enabled: true },
          },
        ],
      },
    })
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('1 targeting rule(s)')
  })
})
