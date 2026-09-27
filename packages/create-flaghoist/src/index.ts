#!/usr/bin/env node
// The package behind `npm create flaghoist`. npm rewrites `npm create <name>` to the package
// `create-<name>`, so this exists purely so the command people reflexively type actually works.
//
// On a terminal it asks a few questions (name, platform, storage, accounts, SSO, dashboard). Flags
// answer questions up front, and `--yes`, or running without a terminal, takes every default. The
// config is written by the CLI's own serializer, so the two cannot drift.
import { PLATFORM_KINDS, setupSummary, STORAGE_KINDS, terminalAsker } from 'flaghoist'
import { relative } from 'node:path'
import { parseArgs } from 'node:util'
import { scaffold, type ScaffoldOptions } from './scaffold'

function printHelp(): void {
  console.log(`create-flaghoist: set up a Flaghoist feature-flag service

Usage:
  npm create flaghoist@latest [directory] -- [options]

With no options it asks a few questions. Any option below answers its question up front.

Options:
  --name <name>             Project name (default: the directory, or team-flags)
  --platform <kind>         One of: ${PLATFORM_KINDS.join(', ')}
  --storage <kind>          One of: ${STORAGE_KINDS.join(', ')}
  --no-accounts             Keep the single admin token, without accounts and roles
  --sso-issuer <url>        Turn on SSO with this OpenID Connect issuer
  --sso-client-id <id>      The SSO client id
  --sso-admin-group <name>  Members of this group become admins
  --no-dashboard            Do not serve the dashboard at /admin
  -y, --yes                 Take the defaults for everything not given
  -h, --help                Show this message

Omit [directory] to be asked for a project name; it becomes the directory.`)
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      storage: { type: 'string' },
      platform: { type: 'string' },
      'no-accounts': { type: 'boolean' },
      'sso-issuer': { type: 'string' },
      'sso-client-id': { type: 'string' },
      'sso-admin-group': { type: 'string' },
      'no-dashboard': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) return printHelp()

  const interactive = process.stdin.isTTY === true && values.yes !== true
  const asker = interactive ? terminalAsker() : undefined
  if (interactive) console.log('\nLet us set up your Flaghoist service.\n')

  const options: ScaffoldOptions = {
    directory: positionals[0],
    name: values.name,
    storage: values.storage,
    platform: values.platform,
    ...(values['no-accounts'] ? { accounts: false } : {}),
    ...(values['no-dashboard'] ? { dashboard: false } : {}),
    ...(values['sso-issuer'] ? { ssoIssuer: values['sso-issuer'] } : {}),
    ...(values['sso-client-id'] ? { ssoClientId: values['sso-client-id'] } : {}),
    ...(values['sso-admin-group'] ? { ssoAdminGroup: values['sso-admin-group'] } : {}),
    asker,
  }

  let result
  try {
    result = await scaffold(options)
  } finally {
    asker?.close()
  }

  const shown = relative(process.cwd(), result.configPath) || 'flaghoist.toml'
  console.log(`\nCreated ${shown}`)
  // Without a terminal the pepper is never printed, so it cannot end up in a CI log.
  const summary = setupSummary(
    interactive ? result.setup : { ...result.setup, pepperGenerated: false },
    result.envPath !== undefined,
  )
  for (const line of summary) console.log(line)

  console.log('\nNext:\n')
  const cd = relative(process.cwd(), result.dir)
  if (cd) console.log(`  cd ${cd}`)
  console.log('  npx flaghoist deploy\n')
  if (result.config.accounts?.enabled) {
    console.log('After deploying, open /admin and sign in with your ADMIN_TOKEN once to create the')
    console.log('owner account. Everyone after that is invited from the Members page.\n')
  }
  console.log('Prefer to own the code? `npx flaghoist eject` turns it into a project you edit.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
