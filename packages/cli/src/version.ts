import { createRequire } from 'node:module'

/**
 * The CLI's own version, read from package.json rather than a literal so it cannot drift from
 * what was released. Bug reports are only useful if this number is true.
 */
export const VERSION = (createRequire(import.meta.url)('../package.json') as { version: string })
  .version
