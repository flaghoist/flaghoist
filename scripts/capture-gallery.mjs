// Render the Product Hunt gallery: five 1270x760 frames (written at 2x) in the brand style of
// brand/og.png, each built around real captures of the product, never a mockup.
//
// Boots the committed dev server and the Vue example, seeds representative flags through the real
// admin API, captures the dashboard and the app, then composes the frames and writes them to
// brand/producthunt. Re-run it whenever the dashboard or the pitch changes.
//
//   pnpm build                        # once, so /admin is served and @flaghoist/vue is built
//   npx playwright install chromium
//   node scripts/capture-gallery.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'brand/producthunt')
const FLAGS_PORT = 8797
const APP_PORT = 5198
const FLAGS_URL = `http://localhost:${FLAGS_PORT}`
const APP_URL = `http://localhost:${APP_PORT}`
const TOKEN = 'admin'
const ADMIN = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
// Shown in place of the dev port, the same swap scripts/capture-dashboard.mjs makes.
const SHOWN_HOST = 'team-flags.you.workers.dev'

const SEED = [
  [
    'new-checkout',
    { enabled: false, rollout: { percentage: 100 }, description: 'The new checkout experience' },
  ],
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
]

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const procs = []

async function untilOk(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 401) return
    } catch {
      /* not up yet */
    }
    await wait(250)
  }
  throw new Error(`never became reachable: ${url}`)
}

async function boot() {
  procs.push(
    spawn('node', [join(ROOT, 'scripts/dev-server.mjs')], {
      env: {
        ...process.env,
        PORT: String(FLAGS_PORT),
        ADMIN_TOKEN: TOKEN,
        READ_API_KEY: 'read-key',
        FLAGS_CORS: APP_URL,
      },
      stdio: 'ignore',
    }),
    spawn(
      'pnpm',
      [
        '--filter',
        '@flaghoist/example-vue',
        'exec',
        'vite',
        '--port',
        String(APP_PORT),
        '--strictPort',
      ],
      {
        cwd: ROOT,
        env: { ...process.env, VITE_FLAGS_URL: FLAGS_URL, VITE_FLAGS_KEY: 'read-key' },
        stdio: 'ignore',
      },
    ),
  )
  await untilOk(`${FLAGS_URL}/health`)
  await untilOk(APP_URL)
}

async function seed() {
  for (const stale of ['beta', 'pricing-page-q3']) {
    await fetch(`${FLAGS_URL}/api/v1/flags/${stale}`, { method: 'DELETE', headers: ADMIN })
  }
  for (const [key, body] of SEED) {
    await fetch(`${FLAGS_URL}/api/v1/flags/${key}`, {
      method: 'PUT',
      headers: ADMIN,
      body: JSON.stringify(body),
    })
  }
}

const swapHost = (page) =>
  page.evaluate((h) => {
    document.querySelectorAll('*').forEach((el) => {
      if (el.children.length === 0 && el.textContent && /localhost:\d+/.test(el.textContent)) {
        el.textContent = el.textContent.replace(/localhost:\d+/, h)
      }
    })
  }, SHOWN_HOST)

const png = async (target) =>
  `data:image/png;base64,${(await target.screenshot()).toString('base64')}`

/** Real captures of the dashboard and the app, as data URLs ready to place in a frame. */
async function capture(browser) {
  const shots = {}
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 2,
  })
  const dash = await ctx.newPage()
  await dash.goto(`${FLAGS_URL}/admin`, { waitUntil: 'networkidle' })
  await dash.getByPlaceholder('Bearer token').fill(TOKEN)
  await dash.getByRole('button', { name: 'Connect' }).click()
  await dash.waitForSelector('text=checkout-v2')
  await dash.getByRole('button', { name: /^Flags/ }).click()
  await dash.waitForSelector('text=Consent banner for EU visitors')
  await swapHost(dash)
  await wait(400)
  shots.flags = await png(dash)

  await dash.getByRole('button', { name: 'Edit eu-cookie-banner', exact: true }).click()
  await wait(600)
  // The editor focuses the description field; blur it so the frame shows the resting state.
  await dash.evaluate(() => document.activeElement?.blur())
  await wait(200)
  shots.rules = await png(dash)
  await dash.keyboard.press('Escape')
  await wait(400)

  const appCtx = await browser.newContext({
    viewport: { width: 600, height: 440 },
    deviceScaleFactor: 2,
  })
  const app = await appCtx.newPage()
  await app.goto(APP_URL, { waitUntil: 'networkidle' })
  await app.waitForSelector('text=legacy checkout')

  // A narrower window, so the whole row, toggle included, fits beside the app in the frame.
  const narrowCtx = await browser.newContext({
    viewport: { width: 1040, height: 680 },
    deviceScaleFactor: 2,
  })
  const narrow = await narrowCtx.newPage()
  await narrow.goto(`${FLAGS_URL}/admin`, { waitUntil: 'networkidle' })
  await narrow.getByPlaceholder('Bearer token').fill(TOKEN)
  await narrow.getByRole('button', { name: 'Connect' }).click()
  await narrow.getByRole('button', { name: /^Flags/ }).click()
  await narrow.waitForSelector('text=The new checkout experience')
  await narrow.getByRole('button', { name: 'Enable new-checkout' }).click()
  await narrow.waitForSelector('button[aria-label="Disable new-checkout"]')
  await swapHost(narrow)
  await wait(400)
  shots.toggled = await png(narrow)
  await narrowCtx.close()

  await app.reload({ waitUntil: 'networkidle' })
  await app.waitForSelector('text=new checkout experience is live')
  await wait(300)
  shots.app = await png(app)

  await ctx.close()
  await appCtx.close()
  return shots
}

// ---- Frames ---------------------------------------------------------------------------------

// Geist, self-hosted from @fontsource like everywhere else (brand/README.md), inlined so the
// frame page needs no network and no file access.
const req = createRequire(join(ROOT, 'apps/web/package.json'))
const font = (pkg, file) => {
  let path
  try {
    path = req.resolve(`${pkg}/files/${file}`)
  } catch {
    path = createRequire(join(ROOT, 'apps/docs/package.json')).resolve(`${pkg}/files/${file}`)
  }
  return `data:font/woff2;base64,${readFileSync(path).toString('base64')}`
}
const FONTS = `
@font-face { font-family: Geist; font-weight: 400; src: url(${font('@fontsource/geist-sans', 'geist-sans-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: Geist; font-weight: 600; src: url(${font('@fontsource/geist-sans', 'geist-sans-latin-600-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Geist Mono'; font-weight: 400; src: url(${font('@fontsource/geist-mono', 'geist-mono-latin-400-normal.woff2')}) format('woff2'); }
`

const MARK = `<svg viewBox="0 0 64 64" width="30" height="30"><circle cx="16" cy="9" r="3" fill="#F7F4EC"/><line x1="16" y1="9" x2="16" y2="57" stroke="#F7F4EC" stroke-width="3.5" stroke-linecap="round"/><path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="#FF4A1F"/><path d="M16 31 L40.5 24 L52 32.5 L16 31 Z" fill="#000" fill-opacity="0.16"/></svg>`

const CSS = `
${FONTS}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1270px; height: 760px; overflow: hidden; }
body {
  background-color: #0B1E3A;
  background-image:
    linear-gradient(rgba(247,244,236,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(247,244,236,.05) 1px, transparent 1px);
  background-size: 64px 64px;
  color: #F7F4EC; font-family: Geist, sans-serif; position: relative;
}
.lockup { position: absolute; left: 64px; top: 52px; display: flex; align-items: center; gap: 8px; font-size: 22px; font-weight: 600; }
.url { position: absolute; left: 64px; bottom: 44px; font: 15px 'Geist Mono', monospace; color: #8B9AB0; }
.url b { color: #FF4A1F; font-weight: 400; }
h1 { font-size: 50px; line-height: 1.08; font-weight: 600; letter-spacing: -0.02em; }
h1 em { font-style: normal; color: #FF4A1F; }
.kicker { font: 14px 'Geist Mono', monospace; color: #FF4A1F; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 18px; }
.sub { font-size: 21px; line-height: 1.45; color: #C9D2DF; margin-top: 18px; }
.points { list-style: none; padding: 0; margin-top: 28px; display: grid; gap: 14px; }
.points li { font-size: 18px; line-height: 1.4; color: #E6EAF0; padding-left: 26px; position: relative; }
.points li::before { content: ''; position: absolute; left: 0; top: 9px; width: 12px; height: 3px; background: #FF4A1F; border-radius: 2px; }
.win { position: absolute; border-radius: 14px; overflow: hidden; background: #fff;
  box-shadow: 0 30px 80px rgba(0,0,0,.45), 0 0 0 1px rgba(247,244,236,.12); }
.bar { height: 34px; background: #EEF0F3; display: flex; align-items: center; gap: 7px; padding: 0 14px; border-bottom: 1px solid #DDE1E6; }
.bar i { width: 11px; height: 11px; border-radius: 50%; background: #CDD2D9; display: block; }
.bar span { margin-left: 14px; font: 13px 'Geist Mono', monospace; color: #5B6575; background: #fff; border: 1px solid #DDE1E6; border-radius: 6px; padding: 3px 12px; }
.win img { display: block; width: 100%; height: calc(100% - 34px); object-fit: cover; object-position: top left; }
.cards { position: absolute; left: 64px; right: 64px; display: grid; gap: 18px; }
.card ul { padding: 0; }
.card { background: rgba(247,244,236,.04); border: 1px solid rgba(247,244,236,.14); border-radius: 14px; padding: 24px 26px; }
.card h3 { font-size: 15px; font-family: 'Geist Mono', monospace; font-weight: 400; color: #FF4A1F; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 16px; }
.card li { list-style: none; font-size: 18px; line-height: 1.35; color: #E6EAF0; padding: 7px 0; border-top: 1px solid rgba(247,244,236,.08); }
.card li:first-child { border-top: 0; padding-top: 0; }
.card li small { display: block; font-size: 14px; color: #8B9AB0; margin-top: 2px; }
pre { font: 13px/1.7 'Geist Mono', monospace; color: #E6EAF0; white-space: pre; }
.code .card { padding: 22px 20px; min-width: 0; }
pre .s { color: #FFB49E; } pre .k { color: #8FB6FF; } pre .c { color: #6F7F96; }
.chips { position: absolute; left: 64px; bottom: 90px; display: flex; gap: 10px; align-items: center; }
.chips span { font: 15px 'Geist Mono', monospace; border: 1px solid rgba(247,244,236,.2); border-radius: 999px; padding: 6px 14px; color: #E6EAF0; }
.chips em { font-style: normal; color: #8B9AB0; font-size: 15px; margin-right: 6px; }
`

const frame = (
  body,
  { footer = true } = {},
) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="lockup">${MARK}Flaghoist</div>${body}
${footer ? '<div class="url"><b>flaghoist.dev</b> &nbsp;·&nbsp; Apache-2.0 &nbsp;·&nbsp; beta</div>' : ''}</body></html>`

const win = (src, url, style) =>
  `<div class="win" style="${style}"><div class="bar"><i></i><i></i><i></i><span>${url}</span></div><img src="${src}"></div>`

// Minimal highlighting: strings and keywords, nothing clever.
const code = (src, keywords) =>
  src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/("[^"]*"|'[^']*')/g, '<span class="s">$1</span>')
    .replace(new RegExp(`\\b(${keywords.join('|')})\\b`, 'g'), '<span class="k">$1</span>')

const TS = `await OpenFeature.setProviderAndWait(
  new FlaghoistProvider({ url, apiKey }),
)

const on = await client.getBooleanValue(
  'new-checkout', false,
  { targetingKey: user.id },
)`
const GO = `provider := ofrep.NewProvider(url,
  ofrep.WithApiKeyAuth(readKey))
openfeature.SetProviderAndWait(provider)

on, _ := client.BooleanValue(ctx,
  "new-checkout", false, evalCtx)`
const PY = `api.set_provider(OFREPProvider(
  url,
  headers_factory=lambda:
    {"x-api-key": read_key},
))

on = client.get_boolean_value(
  "new-checkout", False, ctx)`

function frames(s) {
  return {
    '01-hero': frame(`
      <div style="position:absolute;left:64px;top:150px;width:470px">
        <div class="kicker">Open source feature flags</div>
        <h1>Feature flags you host <em>yourself.</em></h1>
        <p class="sub">On your infrastructure, in your database, read through OpenFeature.</p>
        <ul class="points">
          <li>Cloudflare Workers, or one container anywhere</li>
          <li>Cloudflare KV, Redis, Postgres or SQLite</li>
          <li>Seven languages through standard SDKs</li>
        </ul>
      </div>
      ${win(s.flags, `${SHOWN_HOST}/admin`, 'left:580px;top:120px;width:860px;height:580px')}`),

    '02-flip-it': frame(
      `
      <div style="position:absolute;left:64px;top:118px;width:1140px">
        <h1>Flip it here. <em>Watch it change there.</em></h1>
        <p class="sub">No deploy. The app reads the new value through OpenFeature.</p>
      </div>
      ${win(s.toggled, `${SHOWN_HOST}/admin`, 'left:64px;top:270px;width:730px;height:512px')}
      ${win(s.app, 'your-app.example.com', 'left:826px;top:330px;width:380px;height:313px')}`,
      { footer: false },
    ),

    '03-targeting': frame(`
      <div style="position:absolute;left:64px;top:150px;width:440px">
        <div class="kicker">Targeting</div>
        <h1>Rules and rollouts, <em>no deploy.</em></h1>
        <ul class="points">
          <li>Ordered rules on any attribute you send</li>
          <li>Sticky rollouts that never reshuffle users</li>
          <li>Every change in the audit log, with who and why</li>
        </ul>
      </div>
      ${win(s.rules, `${SHOWN_HOST}/admin`, 'left:560px;top:96px;width:860px;height:620px')}`),

    '04-any-language': frame(`
      <div style="position:absolute;left:64px;top:118px;width:1140px">
        <h1>Read it from <em>any language.</em></h1>
        <p class="sub">Standard OpenFeature SDKs. There is no Flaghoist SDK to install, and leaving is a one-line swap.</p>
      </div>
      <div class="cards code" style="top:290px;grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="card"><h3>TypeScript</h3><pre>${code(TS, ['await', 'new', 'const'])}</pre></div>
        <div class="card"><h3>Go</h3><pre>${code(GO, ['func'])}</pre></div>
        <div class="card"><h3>Python</h3><pre>${code(PY, ['lambda'])}</pre></div>
      </div>
      <div class="chips"><em>Tested guides</em><span>JavaScript</span><span>Go</span><span>Python</span><span>Java</span><span>.NET</span><span>Ruby</span><span>Rust</span></div>`),

    '05-yours': frame(`
      <div style="position:absolute;left:64px;top:118px;width:1140px">
        <h1>Runs where you do.<br><em>Stores where you already store.</em></h1>
      </div>
      <div class="cards" style="top:290px;grid-template-columns:1fr 1fr 1fr">
        <div class="card"><h3>Deploy</h3><ul>
          <li>Cloudflare Workers<small>Scales to zero when idle</small></li>
          <li>One container<small>Docker, Fly.io, Railway, Render</small></li>
          <li>Node, Bun or Deno</li>
        </ul></div>
        <div class="card"><h3>Storage</h3><ul>
          <li>Cloudflare KV</li>
          <li>Redis, Postgres or SQLite</li>
          <li>Your own adapter<small>Four methods: get, put, delete, list</small></li>
        </ul></div>
        <div class="card"><h3>Your team</h3><ul>
          <li>Viewer, editor, admin, owner<small>Optionally per environment</small></li>
          <li>Single sign-on and two-factor</li>
          <li>Audit log and webhooks</li>
        </ul></div>
      </div>
      <p class="sub" style="position:absolute;left:64px;top:600px">No per-seat pricing, because there is no vendor in the loop.</p>`),
  }
}

async function main() {
  await boot()
  await seed()
  const browser = await chromium.launch()
  try {
    const shots = await capture(browser)
    mkdirSync(OUT, { recursive: true })
    const page = await browser.newPage({
      viewport: { width: 1270, height: 760 },
      deviceScaleFactor: 2,
    })
    for (const [name, html] of Object.entries(frames(shots))) {
      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: join(OUT, `${name}.png`) })
      console.log(`wrote brand/producthunt/${name}.png`)
    }
  } finally {
    await browser.close()
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => {
    for (const p of procs) p.kill()
  })
