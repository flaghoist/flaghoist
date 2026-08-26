import { cloudflareKV, type KVNamespaceLike } from '@flaghoist/adapter-cloudflare-kv'
import { apiKey, bearerToken, createFlagServer, memoryRateLimit } from '@flaghoist/server'
import { dashboardHtml } from '@flaghoist/server/dashboard'
import { playgroundHtml } from './playground'

interface Env {
  FLAGS: KVNamespaceLike
  ADMIN_TOKEN: string
  READ_API_KEY: string
  /**
   * The Option A fallback switch. Set to "1" to freeze the sandbox read only: every mutation
   * (PUT, DELETE) is rejected at the edge of the worker, so even a leaked admin token cannot write,
   * the dashboard stays browsable, and the OFREP read path is untouched. Unset (Option B) is the
   * interactive sandbox that anyone can edit and the cron resets.
   */
  DEMO_READONLY?: string
}

/**
 * The state the sandbox resets to. It is the first thing a visitor sees and the thing their edits
 * are wiped back to on every reset, so keep it small and self-explanatory: one plain switch, one
 * partial rollout, and one flag driven by a targeting rule.
 */
const SEED: Record<string, unknown> = {
  'new-checkout': {
    enabled: true,
    rollout: { percentage: 100 },
    description: 'A plain on/off switch. Toggle it here, then read it back from the OFREP endpoint.',
  },
  'dark-mode': {
    enabled: true,
    rollout: { percentage: 50 },
    description:
      'A 50 percent rollout. Bucketing is sticky per targetingKey, so a given user stays on one side.',
  },
  'pro-dashboard': {
    // Enabled, but rolled out to 0 percent, so off by default. Targeting rules are only consulted
    // when a flag is enabled, so this is how you express "off for everyone except a segment": the
    // rule below turns it on for plan=pro.
    enabled: true,
    rollout: { percentage: 0 },
    description: 'Off by default (0 percent), but a targeting rule turns it on for plan=pro.',
    rules: [
      {
        description: 'Pro plans get it',
        conditions: [{ attribute: 'plan', operator: 'eq', value: 'pro' }],
        result: { enabled: true },
      },
    ],
  },
}

// A floating link back to the read playground, injected into the copy of the dashboard this demo
// serves. The dashboard HTML itself is a generated product asset and is left untouched; this only
// decorates the demo's served copy. Bottom left, so it clears the dashboard's own top header.
const PLAYGROUND_LINK =
  '<a href="/" style="position:fixed;left:16px;bottom:16px;z-index:9999;display:inline-flex;' +
  'align-items:center;gap:6px;padding:8px 14px;border-radius:999px;background:#111a2e;' +
  'color:#e7ecf5;border:1px solid #ff4a1f;text-decoration:none;' +
  'font:600 14px ui-sans-serif,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)">' +
  '&larr; Read playground</a>'

/**
 * Build the demo's copy of the dashboard: the read-playground link, plus an auto sign-in. The demo
 * admin token is public by design, so rather than make every visitor paste it, seed the same
 * sessionStorage entry the dashboard reads on boot. This runs as a classic inline script, which
 * executes during parse, before the deferred app module, so the app boots already connected. A
 * visitor who signs out (which clears the entry) is signed back in on the next load, which is the
 * right behaviour for a shared sandbox. Memoised, since the token is constant per deployment.
 */
let cachedDashboard: string | null = null
let cachedForToken: string | null = null
function demoDashboard(adminToken: string): string {
  if (cachedDashboard !== null && cachedForToken === adminToken) return cachedDashboard
  const autoSignIn =
    '<script>try{var k="flaghoist.admin";if(!sessionStorage.getItem(k))' +
    `sessionStorage.setItem(k,JSON.stringify({url:location.origin,token:${JSON.stringify(
      adminToken,
    )}}));}catch(e){}</script>`
  cachedForToken = adminToken
  cachedDashboard = dashboardHtml
    .replace('<head>', `<head>${autoSignIn}`)
    .replace('</body>', `${PLAYGROUND_LINK}</body>`)
  return cachedDashboard
}

const config = (env: Env) => ({
  storage: cloudflareKV(env.FLAGS),
  dashboard: demoDashboard(env.ADMIN_TOKEN),
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKey(env.READ_API_KEY),
  },
  // The dashboard SPA is same origin, so it needs no CORS entry. These origins let the marketing
  // and docs sites call the public read endpoint from the browser for a live example.
  allowedOrigins: [
    'https://demo.flaghoist.dev',
    'https://flaghoist.dev',
    'https://docs.flaghoist.dev',
  ],
  // A public endpoint. This in memory limiter caps a burst per isolate; the real fleet wide guards
  // are the Cloudflare WAF rate-limit and Managed Challenge rules on the zone (see README).
  rateLimit: memoryRateLimit({ max: 60, windowMs: 60_000 }),
  // Do not hand a scanner the route map on a public demo.
  exposeOpenApi: false,
})

const app = createFlagServer<Env>(config)

/**
 * Reset the sandbox to SEED. Because this instance is shared and publicly writable, anyone can
 * create, toggle or delete flags through the dashboard; the cron trigger runs this on a schedule so
 * those edits never persist for long. It drives the same admin HTTP path a real caller would, so
 * every write goes through the usual validation rather than reaching past it into storage.
 */
async function reseed(env: Env): Promise<void> {
  // Wipe straight through storage. This is internal, needs no validation, and skips the rate
  // limiter, so a burst of vandalism (more flags than the per-minute cap) still gets cleared in one
  // pass rather than being throttled halfway.
  const storage = cloudflareKV(env.FLAGS)
  const existing = await storage.list()
  await Promise.all(existing.map((flag) => storage.delete(flag.key)))

  // Seed through the admin HTTP path, so every seeded flag goes through the same validation and
  // metadata stamping a real caller would hit, rather than being written raw.
  const headers = {
    Authorization: `Bearer ${env.ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  }
  for (const [key, body] of Object.entries(SEED)) {
    await app.fetch(
      new Request(`https://demo.flaghoist.dev/api/v1/flags/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      }),
      env,
    )
  }
}

/** The slice of the Workers execution context this worker uses, typed locally to avoid a
 * dependency on @cloudflare/workers-types (wrangler bundles with esbuild and strips types). */
type ExecCtx = { waitUntil(promise: Promise<unknown>): void }

export default {
  fetch(request: Request, env: Env, ctx: ExecCtx) {
    // The read playground, served at the demo root and /playground. It calls the OFREP endpoint the
    // same way an app would, so a visitor sees the read path, not just the admin UI.
    const { pathname } = new URL(request.url)
    if (request.method === 'GET' && (pathname === '/' || pathname === '/playground')) {
      return new Response(playgroundHtml(env.READ_API_KEY), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    // Option A: refuse every mutation at the worker edge. PUT and DELETE exist only on the admin
    // CRUD routes, and the OFREP read path is POST, so this blocks all writes without touching
    // reads, and holds even if the admin token has leaked.
    if (env.DEMO_READONLY === '1' && (request.method === 'PUT' || request.method === 'DELETE')) {
      return new Response(JSON.stringify({ error: 'This demo instance is read only' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }
    return app.fetch(request, env, ctx as never)
  },
  scheduled(_event: unknown, env: Env, ctx: ExecCtx) {
    // Nothing changes in read only mode, so there is nothing to reset, and skipping it spends no
    // write budget.
    if (env.DEMO_READONLY === '1') return
    ctx.waitUntil(reseed(env))
  },
}
