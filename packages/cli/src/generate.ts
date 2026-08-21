import type { FlaghoistConfig, StorageKind } from './config'

interface StorageSnippet {
  imports: string[]
  expr: string
  pkg: string
  extraDeps?: Record<string, string>
}

function storageSnippet(storage: StorageKind): StorageSnippet {
  switch (storage) {
    case 'cloudflare-kv':
      return {
        imports: [`import { cloudflareKV } from '@flaghoist/adapter-cloudflare-kv'`],
        expr: 'cloudflareKV(env.FLAGS)',
        pkg: '@flaghoist/adapter-cloudflare-kv',
      }
    case 'redis':
      return {
        imports: [
          `import { redisAdapter } from '@flaghoist/adapter-redis'`,
          `import { Redis } from '@upstash/redis/cloudflare'`,
        ],
        expr: 'redisAdapter(Redis.fromEnv(env))',
        pkg: '@flaghoist/adapter-redis',
        extraDeps: { '@upstash/redis': '^1.34.0' },
      }
    case 'postgres':
      return {
        imports: [
          `import { postgresAdapter } from '@flaghoist/adapter-postgres'`,
          `import { Pool } from 'pg'`,
        ],
        expr: 'postgresAdapter(new Pool({ connectionString: env.DATABASE_URL }))',
        pkg: '@flaghoist/adapter-postgres',
        extraDeps: { pg: '^8.13.0' },
      }
    case 'memory':
      return {
        imports: [`import { memoryAdapter } from '@flaghoist/adapter-memory'`],
        expr: 'memoryAdapter()',
        pkg: '@flaghoist/adapter-memory',
      }
  }
}

function adminExpr(admin: FlaghoistConfig['auth']['admin']): string {
  return admin === 'oidc'
    ? "oidc({ issuer: env.OIDC_ISSUER, audience: env.OIDC_AUDIENCE, groupsClaim: 'cognito:groups', allowedGroups: (env.ADMIN_GROUPS ?? '').split(',') })"
    : 'bearerToken(env.ADMIN_TOKEN)'
}

/** Generate the Worker entry (`src/index.ts`) that composes the server from a config. */
export function generateWorkerEntry(config: FlaghoistConfig): string {
  const storage = storageSnippet(config.storage)
  const serverImports = [
    'apiKey',
    'createFlagServer',
    config.auth.admin === 'oidc' ? 'oidc' : 'bearerToken',
  ].sort()
  const imports = [
    ...storage.imports,
    `import { ${serverImports.join(', ')} } from '@flaghoist/server'`,
    // A subpath import, so a Worker built with `dashboard = false` never pulls the HTML in.
    ...(config.dashboard ? [`import { dashboardHtml } from '@flaghoist/server/dashboard'`] : []),
  ].join('\n')
  const origins =
    config.allowedOrigins && config.allowedOrigins.length > 0
      ? `\n  allowedOrigins: ${JSON.stringify(config.allowedOrigins)},`
      : ''
  const dashboard = config.dashboard ? '\n  dashboard: dashboardHtml,' : ''
  return `${imports}

export default createFlagServer((env) => ({
  storage: ${storage.expr},
  auth: {
    admin: ${adminExpr(config.auth.admin)},
    read: apiKey(env.READ_API_KEY),
  },${origins}${dashboard}
}))
`
}

/** Generate a `wrangler.toml` for deploying the Worker. */
export function generateWranglerToml(config: FlaghoistConfig): string {
  const lines = [
    `name = ${JSON.stringify(config.name)}`,
    `main = "src/index.ts"`,
    `compatibility_date = "2025-01-01"`,
  ]
  if (config.storage === 'cloudflare-kv') {
    lines.push(
      '',
      '# Create with: npx wrangler kv namespace create FLAGS',
      'kv_namespaces = [',
      `  { binding = "FLAGS", id = "<your-kv-namespace-id>" }`,
      ']',
    )
  }
  return `${lines.join('\n')}\n`
}

/** Generate a `package.json` for the ejected Worker project. */
export function generatePackageJson(config: FlaghoistConfig): string {
  const storage = storageSnippet(config.storage)
  const dependencies: Record<string, string> = {
    '@flaghoist/server': '^0.1.0',
    [storage.pkg]: '^0.1.0',
    ...storage.extraDeps,
  }
  const pkg = {
    name: config.name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { dev: 'wrangler dev', deploy: 'wrangler deploy' },
    dependencies,
    devDependencies: { wrangler: '^4.0.0' },
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}
