// Record the README demo GIF: the four-beat story of flipping a flag and watching an app change,
// all against real software, never a mockup.
//
//   Beat 1  the Vue example on the legacy checkout
//   Beat 2  the dashboard at /admin, signed in, the flag list
//   Beat 3  one click toggles `new-checkout` on
//   Beat 4  the Vue example, reloaded, now on the new checkout
//
// Local (stage 1, no Cloudflare account needed). Boots the committed dev server and the Vue
// example, drives the real UI, writes brand/demo.gif:
//
//   pnpm build            # once, so /admin is served and @flaghoist/vue is built
//   npx playwright install chromium
//   node scripts/record-demo.mjs
//
// Real deploy (stage 2/3). Point it at a live server and a deployed example, so the URL on screen
// is the real one. Nothing else changes:
//
//   FLAGS_URL=https://demo.flaghoist.dev \
//   APP_URL=https://<your-deployed-vue-example> \
//   ADMIN_TOKEN=<token> READ_KEY=<read key> \
//   node scripts/record-demo.mjs
//
// Requires gifski and ffmpeg on PATH (brew install gifski ffmpeg).
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = process.env.OUT ?? join(ROOT, 'brand/demo.gif')
const WIDTH = Number(process.env.WIDTH ?? 1400)
const HEIGHT = Number(process.env.HEIGHT ?? 875)
const FPS = Number(process.env.FPS ?? 14)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'admin'
const READ_KEY = process.env.READ_KEY ?? 'read-key'

// Remote when both URLs are given; otherwise boot the local stack on these ports.
const FLAGS_PORT = Number(process.env.FLAGS_PORT ?? 8790)
const APP_PORT = Number(process.env.APP_PORT ?? 5190)
const FLAGS_URL = process.env.FLAGS_URL ?? `http://localhost:${FLAGS_PORT}`
const APP_URL = process.env.APP_URL ?? `http://localhost:${APP_PORT}`
const local = !process.env.FLAGS_URL && !process.env.APP_URL

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

function need(bin, flag = '--version') {
  // ffmpeg uses a single-dash -version, unlike gifski's --version.
  if (spawnSync(bin, [flag], { stdio: 'ignore' }).status !== 0) {
    throw new Error(`${bin} is required on PATH (brew install gifski ffmpeg)`)
  }
}

async function bootLocal() {
  procs.push(
    spawn('node', [join(ROOT, 'scripts/dev-server.mjs')], {
      env: {
        ...process.env,
        PORT: String(FLAGS_PORT),
        ADMIN_TOKEN,
        READ_API_KEY: READ_KEY,
        // The example reads flags from the browser, so its origin must be allowed.
        FLAGS_CORS: APP_URL,
      },
      stdio: 'ignore',
    }),
  )
  procs.push(
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
        env: { ...process.env, VITE_FLAGS_URL: FLAGS_URL, VITE_FLAGS_KEY: READ_KEY },
        stdio: 'ignore',
      },
    ),
  )
  await untilOk(`${FLAGS_URL}/health`)
  await untilOk(APP_URL)
}

async function seed() {
  // Beat 1 must show the legacy checkout, so `new-checkout` starts off.
  await fetch(`${FLAGS_URL}/api/v1/flags/new-checkout`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
    // Disabled but at 100%, so the one click that flips `enabled` turns it fully on for everyone.
    body: JSON.stringify({
      enabled: false,
      rollout: { percentage: 100 },
      description: 'Redesigned checkout flow',
    }),
  })
}

async function drive(page) {
  // Beat 1: the app on the legacy checkout.
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=legacy checkout')
  await wait(2600)

  // Beat 2: the dashboard, signed in, the flag list. /admin prefills the server URL it is served
  // from, so only the token is typed.
  await page.goto(`${FLAGS_URL}/admin`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Bearer token').fill(ADMIN_TOKEN)
  await page.getByRole('button', { name: 'Connect' }).click()
  await page.waitForSelector('text=new-checkout')
  // Local runs serve on a dev port; swap that one display string for the docs' example host so the
  // frame does not read as a dev artifact. The UI, data and behaviour are all real, as with a real
  // deploy (set FLAGS_URL/APP_URL), where the real hostname is shown and nothing is swapped.
  if (local) {
    await page.evaluate((h) => {
      document.querySelectorAll('*').forEach((el) => {
        if (el.children.length === 0 && el.textContent?.includes(h)) {
          el.textContent = el.textContent.replace(h, 'flags.example.com')
        }
      })
    }, `localhost:${FLAGS_PORT}`)
  }
  await wait(2200)

  // Beat 3: one click turns it on.
  await page.getByRole('button', { name: 'Enable new-checkout' }).click()
  await page.waitForSelector('button[aria-label="Disable new-checkout"]')
  await wait(2200)

  // Beat 4: back to the app, now on the new checkout.
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=new checkout experience is live')
  await wait(3000)
}

async function encode(webm) {
  const frames = mkdtempSync(join(tmpdir(), 'demo-frames-'))
  const ff = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      webm,
      '-vf',
      `fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`,
      join(frames, '%04d.png'),
    ],
    { stdio: 'ignore' },
  )
  if (ff.status !== 0) throw new Error('ffmpeg frame extraction failed')
  const pngs = readdirSync(frames)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => join(frames, f))
  const gs = spawnSync(
    'gifski',
    ['--fps', String(FPS), '--width', String(WIDTH), '--quality', '90', '-o', OUT, ...pngs],
    { stdio: 'inherit' },
  )
  rmSync(frames, { recursive: true, force: true })
  if (gs.status !== 0) throw new Error('gifski failed')
}

async function main() {
  need('gifski')
  need('ffmpeg', '-version')
  if (local) await bootLocal()
  else await untilOk(`${FLAGS_URL}/health`)
  await seed()

  const videoDir = mkdtempSync(join(tmpdir(), 'demo-video-'))
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    recordVideo: { dir: videoDir, size: { width: WIDTH, height: HEIGHT } },
  })
  const page = await context.newPage()
  try {
    await drive(page)
  } finally {
    await context.close() // flushes the .webm
    await browser.close()
  }
  const webm = join(
    videoDir,
    readdirSync(videoDir).find((f) => f.endsWith('.webm')),
  )
  await encode(webm)
  rmSync(videoDir, { recursive: true, force: true })
  console.log(`wrote ${OUT}`)
}

main()
  .catch((err) => {
    console.error(err.message ?? err)
    process.exitCode = 1
  })
  .finally(() => {
    for (const p of procs) p.kill()
  })
