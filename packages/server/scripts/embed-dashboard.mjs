// Generates src/dashboard.ts from the dashboard's single-file build, so `@flaghoist/server`
// can ship the admin UI as a string and the generated Worker can serve it at /admin.
//
// Chained into the server's build, test and typecheck scripts. Turbo builds
// @flaghoist/dashboard first (it is a devDependency of this package purely for that ordering),
// so the dist is present by the time this runs.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const repoRoot = join(packageRoot, '..', '..')
const source = join(repoRoot, 'apps', 'dashboard', 'dist', 'index.html')
const target = join(packageRoot, 'src', 'dashboard.ts')

let html
try {
  html = await readFile(source, 'utf8')
} catch (err) {
  if (err.code !== 'ENOENT') throw err
  console.error(
    `embed-dashboard: no dashboard build at ${source}\n` +
      `Run \`pnpm --filter @flaghoist/dashboard build\` first, or use \`pnpm build\` from the ` +
      `repo root so turbo builds it for you.`,
  )
  process.exit(1)
}

const contents = `// GENERATED FILE, DO NOT EDIT.
// Produced by scripts/embed-dashboard.mjs from apps/dashboard/dist/index.html.

/**
 * The admin dashboard as a single self-contained HTML document, ready to hand to
 * \`createFlagServer\` as \`config.dashboard\` so it is served at \`/admin\`.
 *
 * Imported from a subpath (\`@flaghoist/server/dashboard\`) rather than the package root, so
 * deployments that do not want the UI never pull the string into their bundle.
 */
export const dashboardHtml: string = ${JSON.stringify(html)}
`

// Skip the write when nothing changed, so repeat builds do not churn the mtime and retrigger
// watchers downstream.
let existing
try {
  existing = await readFile(target, 'utf8')
} catch (err) {
  if (err.code !== 'ENOENT') throw err
}

if (existing === contents) {
  process.exit(0)
}

await mkdir(dirname(target), { recursive: true })
await writeFile(target, contents, 'utf8')
