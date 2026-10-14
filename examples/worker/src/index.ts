import { cloudflareKV, type KVNamespaceLike } from '@flaghoist/adapter-cloudflare-kv'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { dashboardHtml } from '@flaghoist/server/dashboard'

interface Env {
  FLAGS: KVNamespaceLike
  ADMIN_TOKEN: string
  READ_API_KEY: string
}

/**
 * This one file IS your flag service. `wrangler deploy` puts it live at
 * https://<name>.<account>.workers.dev, serving the OFREP read API, the admin API, and the
 * dashboard at /admin in a single deploy, backed by Workers KV, scaling to zero when idle. Drop the
 * `dashboard` line to ship the APIs without the UI.
 */
export default createFlagServer<Env>((env) => ({
  storage: cloudflareKV(env.FLAGS),
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKey(env.READ_API_KEY),
  },
  dashboard: dashboardHtml,
  allowedOrigins: ['https://your-app.example.com'],
}))
