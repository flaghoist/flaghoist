import { memoryAdapter } from '@flaghoist/adapter-memory'
import { initPostgres, postgresAdapter } from '@flaghoist/adapter-postgres'
import { redisAdapter } from '@flaghoist/adapter-redis'
import { apiKey, bearerToken, createFlagServer, memoryRateLimit } from '@flaghoist/server'
import { dashboardHtml } from '@flaghoist/server/dashboard'
import { serve } from '@hono/node-server'

// One image, any host. Everything is driven by environment variables, so the same container runs on
// a plain VPS, Fly.io, Railway, DigitalOcean, Cloud Run, ECS, or Kubernetes, with no code to edit.
const env = process.env
const kind = env.FLAGS_STORAGE ?? 'memory'

async function makeStorage() {
  if (kind === 'postgres') {
    if (!env.DATABASE_URL) throw new Error('FLAGS_STORAGE=postgres requires DATABASE_URL')
    const { Pool } = await import('pg')
    const table = env.FLAGS_TABLE ?? 'flaghoist_flags'
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      // Managed Postgres (Supabase, Neon, Render) requires TLS. Skip this if your URL sets sslmode.
      ssl: /sslmode=/.test(env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
    })
    await initPostgres(pool, table)
    return postgresAdapter(pool, { table })
  }

  if (kind === 'redis') {
    if (!env.REDIS_URL) throw new Error('FLAGS_STORAGE=redis requires REDIS_URL')
    const { default: Redis } = await import('ioredis')
    return redisAdapter(new Redis(env.REDIS_URL), { hashKey: env.FLAGS_HASH_KEY ?? 'flaghoist:flags' })
  }

  if (kind === 'memory') {
    console.warn('[flaghoist] FLAGS_STORAGE=memory: flags are in-process and are lost on restart.')
    return memoryAdapter()
  }

  throw new Error(`Unknown FLAGS_STORAGE "${kind}". Use postgres, redis, or memory.`)
}

const app = createFlagServer({
  storage: await makeStorage(),
  dashboard: dashboardHtml,
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKey(env.READ_API_KEY),
  },
  rateLimit: memoryRateLimit(),
  // Comma-separated list of browser origins allowed to read flags cross-origin.
  allowedOrigins: env.FLAGS_CORS ? env.FLAGS_CORS.split(',').map((o) => o.trim()) : undefined,
})

const port = Number(env.PORT ?? 8080)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
console.log(`[flaghoist] listening on :${port} (storage: ${kind})`)
