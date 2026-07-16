import { cloudflareKV, type KVNamespaceLike } from '@flaghoist/adapter-cloudflare-kv'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'

interface Env {
  FLAGS: KVNamespaceLike
  ADMIN_TOKEN: string
  READ_API_KEY: string
}

/**
 * This one file IS your flag service. `wrangler deploy` puts it live at
 * https://<name>.<account>.workers.dev — the OFREP read API and the admin API in a single
 * deploy, backed by Workers KV, scaling to zero when idle.
 */
export default createFlagServer<Env>((env) => ({
  storage: cloudflareKV(env.FLAGS),
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKey(env.READ_API_KEY),
  },
  allowedOrigins: ['https://your-app.example.com'],
}))
