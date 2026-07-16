import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { memoryAdapter } from '@flaghoist/adapter-memory'
import { createFlag } from '@flaghoist/core'
import { FlaghoistProvider } from '@flaghoist/provider-node'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { OpenFeature } from '@openfeature/server-sdk'

// 1. Stand up a Flaghoist server in-process. In production you deploy this once, separately —
//    here it is inline so the example runs on its own.
const app = createFlagServer({
  storage: memoryAdapter([
    createFlag({ key: 'new-checkout', enabled: true, rollout: { percentage: 100 } }),
    createFlag({
      key: 'beta',
      enabled: true,
      rollout: { percentage: 0 },
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
          result: { enabled: true },
        },
      ],
    }),
  ]),
  auth: { admin: bearerToken('admin'), read: apiKey('read-key') },
})

const server = createServer((req, res) => {
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

// 2. Point an OpenFeature client at it via the Flaghoist provider.
await OpenFeature.setProviderAndWait(
  new FlaghoistProvider({ url: `http://localhost:${port}`, apiKey: 'read-key' }),
)
const client = OpenFeature.getClient()

// 3. Evaluate flags with per-request context — the app never mentions "Flaghoist" again.
const checkout = await client.getBooleanValue('new-checkout', false, { targetingKey: 'u1' })
const betaForBetaUser = await client.getBooleanValue('beta', false, {
  targetingKey: 'u1',
  plan: 'beta',
})
const betaForFreeUser = await client.getBooleanValue('beta', false, {
  targetingKey: 'u2',
  plan: 'free',
})

console.log('new-checkout                →', checkout)
console.log('beta (plan=beta targeting)  →', betaForBetaUser)
console.log('beta (plan=free targeting)  →', betaForFreeUser)

await OpenFeature.close()
server.close()
