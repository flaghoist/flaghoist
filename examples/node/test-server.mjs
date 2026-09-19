import { createServer } from 'node:http'

// Resolve from monorepo node_modules
const { memoryAdapter } = await import('@flaghoist/adapter-memory')
const { createFlag } = await import('@flaghoist/core')
const { bearerToken, apiKey, createFlagServer } = await import('@flaghoist/server')

const app = createFlagServer({
  storage: memoryAdapter([
    createFlag({ key: 'new-checkout', enabled: true, rollout: { percentage: 100 }, description: 'New checkout flow for all users' }),
    createFlag({ key: 'beta-features', enabled: true, rollout: { percentage: 50 }, description: 'Beta feature rollout' }),
    createFlag({ key: 'dark-mode', enabled: false, rollout: { percentage: 0 }, description: 'Dark mode toggle' }),
    createFlag({ key: 'onboarding-v2', enabled: true, rollout: { percentage: 25 }, description: 'Updated onboarding experience',
      rules: [{ conditions: [{ attribute: 'plan', operator: 'eq', value: 'pro' }], result: { enabled: true } }]
    }),
    createFlag({ key: 'maintenance-banner', enabled: false, rollout: { percentage: 100 }, description: 'Show maintenance banner' }),
  ]),
  auth: { admin: bearerToken('test-admin-token'), read: apiKey('read-key') },
  allowedOrigins: ['http://localhost:5173'],
})

const server = createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', async () => {
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    })
    const response = await app.fetch(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(await response.text())
  })
})

server.listen(8787, () => {
  console.log('Test server running on http://localhost:8787')
})
