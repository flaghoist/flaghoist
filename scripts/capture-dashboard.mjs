// Capture real screenshots of the admin dashboard for the landing page.
//
// The marketing site must show the actual product, not a hand-built imitation of it. This boots the
// committed dev server, seeds representative flags through the real admin API, drives the real UI,
// and writes PNGs into apps/web/public. Re-run it whenever the dashboard changes so the site cannot
// drift from what ships.
//
// Run: node scripts/capture-dashboard.mjs   (requires: npx playwright install chromium)
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const PORT = 8788
const TOKEN = 'admin'
const BASE = `http://localhost:${PORT}`
const out = (f) => fileURLToPath(new URL(`../apps/web/public/${f}`, import.meta.url))

const FLAGS = [
  [
    'checkout-v2',
    { enabled: true, rollout: { percentage: 25 }, description: 'Redesigned checkout flow' },
  ],
  [
    'dark-mode',
    { enabled: true, rollout: { percentage: 100 }, description: 'Dark theme across the app' },
  ],
  [
    'eu-cookie-banner',
    {
      enabled: true,
      rollout: { percentage: 100 },
      description: 'Consent banner for EU visitors',
      rules: [
        {
          conditions: [{ attribute: 'country', operator: 'in', value: ['DE', 'FR', 'ES', 'IT'] }],
          result: { enabled: true, rollout: { percentage: 100 } },
        },
      ],
    },
  ],
  [
    'search-rerank',
    { enabled: true, rollout: { percentage: 50 }, description: 'ML reranking on search results' },
  ],
  [
    'pricing-page-q3',
    { enabled: false, rollout: { percentage: 0 }, description: 'Q3 pricing experiment' },
  ],
]

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function untilHealthy(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return true
    } catch {
      /* not up yet */
    }
    await wait(250)
  }
  throw new Error(`dev server never became healthy on ${BASE}`)
}

const server = spawn('node', [fileURLToPath(new URL('./dev-server.mjs', import.meta.url))], {
  env: { ...process.env, PORT: String(PORT), ADMIN_TOKEN: TOKEN },
  stdio: 'ignore',
})

try {
  await untilHealthy()

  // Seed through the real admin API, so what is photographed is genuinely what the server stores.
  for (const [key, body] of FLAGS) {
    await fetch(`${BASE}/api/v1/flags/${key}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  for (const stale of ['new-checkout', 'beta']) {
    await fetch(`${BASE}/api/v1/flags/${stale}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2,
  })

  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  // The gate prefills the origin it is served from, which is already this server, so only the
  // token needs filling.
  await page.getByPlaceholder('Bearer token').fill(TOKEN)
  await page.getByRole('button', { name: 'Connect' }).click()
  await page.waitForSelector('text=checkout-v2')

  // Swap the visible localhost address for a representative deployed one. The UI, the data and the
  // state are all real; only this one string would otherwise read as a dev artifact on a marketing
  // page. Nothing about behaviour or capability is altered.
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((el) => {
      if (el.children.length === 0 && el.textContent?.startsWith('http://localhost:')) {
        el.textContent = 'team-flags.you.workers.dev'
      }
    })
  })

  await wait(400) // let the toggle and slider transitions settle

  await page.screenshot({ path: out('shot-flags.png') })
  console.log('wrote apps/web/public/shot-flags.png')

  // The rule builder is the capability the flag list cannot show, so it earns its own shot.
  await page.getByRole('button', { name: 'Edit' }).nth(2).click()
  await wait(600)
  await page.screenshot({ path: out('shot-rules.png') })
  console.log('wrote apps/web/public/shot-rules.png')

  await browser.close()
} finally {
  server.kill()
}
