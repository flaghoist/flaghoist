#!/usr/bin/env node
// The package behind `npm create flaghoist`. npm rewrites `npm create <name>` to the package
// `create-<name>`, so this exists purely so the command people reflexively type actually works.
//
// It does one thing the CLI's own `flaghoist init` does not: create the directory. Everything
// else is delegated, and the config is written by the CLI's serializer so the two cannot drift.
import { PLATFORM_KINDS, STORAGE_KINDS } from 'flaghoist'
import { parseArgs } from 'node:util'
import { relative } from 'node:path'
import { scaffold } from './scaffold'

function printHelp(): void {
  console.log(`create-flaghoist — scaffold a Flaghoist feature-flag service

Usage:
  npm create flaghoist@latest <directory> [--storage <kind>] [--platform <kind>]

Options:
  --storage    One of: ${STORAGE_KINDS.join(', ')}  (default: ${STORAGE_KINDS[0]})
  --platform   One of: ${PLATFORM_KINDS.join(', ')}  (default: ${PLATFORM_KINDS[0]})
  -h, --help   Show this message

Omit <directory> to scaffold into the current directory (it must be empty).`)
}

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      storage: { type: 'string' },
      platform: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) return printHelp()

  const { dir, configPath, config } = scaffold({
    directory: positionals[0],
    storage: values.storage,
    platform: values.platform,
  })

  const shown = relative(process.cwd(), configPath) || 'flaghoist.toml'
  console.log(`\nCreated ${shown}`)
  console.log(`  name      ${config.name}`)
  console.log(`  storage   ${config.storage}`)
  console.log(`  platform  ${config.platform}\n`)
  console.log('That file is the entire project. Next:\n')
  const cd = relative(process.cwd(), dir)
  if (cd) console.log(`  cd ${cd}`)
  console.log('  npx flaghoist deploy\n')
  console.log('Prefer to own the code? `npx flaghoist eject` turns it into a project you edit.')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
