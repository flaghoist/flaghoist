// A local Flaghoist server for development: run `pnpm dev:server` from the repo root.
//
// It uses the in-memory adapter (so changes last until you stop it), seeds a couple of flags,
// opens CORS to the common Vite dev ports, and — if the dashboard has been built — serves the
// admin UI at /admin. Point the browser examples (or your own app) at http://localhost:8787.
//
// Everything is overridable by env: PORT, READ_API_KEY, ADMIN_TOKEN, FLAGS_CORS (comma-separated).
import { memoryAdapter } from '@flaghoist/adapter-memory'
import { createFlag } from '@flaghoist/core'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT ?? 8787)
const READ_KEY = process.env.READ_API_KEY ?? 'read-key'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'admin'
const CORS = (
  process.env.FLAGS_CORS ??
  'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:4173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Serve the admin dashboard too, if it has been built (`pnpm build`).
const dashboardPath = fileURLToPath(new URL('../apps/dashboard/dist/index.html', import.meta.url))
const dashboard = existsSync(dashboardPath) ? readFileSync(dashboardPath, 'utf8') : undefined

const app = createFlagServer({
  storage: memoryAdapter([
    createFlag({
      key: 'new-checkout',
      enabled: true,
      rollout: { percentage: 100 },
      description: 'Redesigned checkout',
      identity: 'dev',
    }),
    createFlag({
      key: 'beta',
      enabled: true,
      rollout: { percentage: 0 },
      description: 'Beta features (on for plan=beta)',
      identity: 'dev',
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
          result: { enabled: true },
        },
      ],
    }),
  ]),
  auth: { admin: bearerToken(ADMIN_TOKEN), read: apiKey(READ_KEY) },
  allowedOrigins: CORS,
  dashboard,
})

createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', async () => {
    const response = await app.fetch(
      new Request(`http://localhost:${PORT}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      }),
    )
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
}).listen(PORT, () => {
  console.log(`
  Flaghoist dev server  →  http://localhost:${PORT}

    read API key   ${READ_KEY}
    admin token    ${ADMIN_TOKEN}
    CORS allowed   ${CORS.join(', ')}
    dashboard      ${dashboard ? `http://localhost:${PORT}/admin` : '(run `pnpm build` to enable /admin)'}
    seeded flags   new-checkout, beta

  Try it:  curl -s localhost:${PORT}/health
  Manage:  FLAGS_URL=http://localhost:${PORT} FLAGS_ADMIN_TOKEN=${ADMIN_TOKEN} node packages/cli/dist/index.js flag list
  Ctrl+C to stop.
`)
})
