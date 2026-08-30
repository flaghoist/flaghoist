import type { FlaghoistConfig, StorageKind } from './config'

/**
 * Files for the `container` platform: a Node entry served by `@hono/node-server`, plus a Dockerfile.
 * The same image runs on any container or Node host (Render, Fly, Railway, a VPS), configured by
 * environment variables.
 *
 * `examples/docker` is the hand-maintained reference for this shape. These generators produce the
 * same runtime logic, parameterised by a project's config; the storage switch, its TLS and hash-key
 * handling, and the listen line are kept verbatim so the two cannot drift apart unnoticed (a test
 * asserts it).
 */

/**
 * Dependency ranges for a container project. Every storage adapter is a static import in the entry,
 * so all of them are installed regardless of the chosen default; the store is picked at runtime.
 * Kept in step with `examples/docker/package.json`.
 */
const CONTAINER_DEPS: Record<string, string> = {
  '@flaghoist/adapter-memory': '^0.1.2',
  '@flaghoist/adapter-postgres': '^0.1.2',
  '@flaghoist/adapter-redis': '^0.1.2',
  '@flaghoist/server': '^0.3.0',
  '@hono/node-server': '^2.1.1',
  ioredis: '^5.4.0',
  pg: '^8.13.0',
}

/** The port the container listens on, and the Dockerfile exposes. */
const CONTAINER_PORT = 8080

export type ContainerStorage = 'postgres' | 'redis' | 'memory'

/**
 * The `FLAGS_STORAGE` a fresh container defaults to. Cloudflare KV cannot be reached off Workers, so
 * a config that still names it (the scaffolding default) falls back to memory, which always boots;
 * the CLI notes this when it scaffolds. Every kind stays overridable at runtime via the env var.
 */
export function containerStorageDefault(storage: StorageKind): ContainerStorage {
  return storage === 'cloudflare-kv' ? 'memory' : storage
}

/** Admin auth expression, reading from `env` (aliased to `process.env` in the entry). */
function adminExpr(admin: FlaghoistConfig['auth']['admin']): string {
  return admin === 'oidc'
    ? "oidc({ issuer: env.OIDC_ISSUER, audience: env.OIDC_AUDIENCE, groupsClaim: 'cognito:groups', allowedGroups: (env.ADMIN_GROUPS ?? '').split(',') })"
    : 'bearerToken(env.ADMIN_TOKEN)'
}

/** Generate the Node entry (`server.mjs`) that composes the server from a config. */
export function generateNodeEntry(config: FlaghoistConfig): string {
  const defaultStorage = containerStorageDefault(config.storage)
  const serverImports = [
    'apiKey',
    'createFlagServer',
    'memoryRateLimit',
    config.auth.admin === 'oidc' ? 'oidc' : 'bearerToken',
  ].sort()
  const imports = [
    `import { memoryAdapter } from '@flaghoist/adapter-memory'`,
    `import { initPostgres, postgresAdapter } from '@flaghoist/adapter-postgres'`,
    `import { redisAdapter } from '@flaghoist/adapter-redis'`,
    `import { ${serverImports.join(', ')} } from '@flaghoist/server'`,
    ...(config.dashboard ? [`import { dashboardHtml } from '@flaghoist/server/dashboard'`] : []),
    `import { serve } from '@hono/node-server'`,
  ].join('\n')
  const dashboard = config.dashboard ? '\n  dashboard: dashboardHtml,' : ''
  const origins =
    config.allowedOrigins && config.allowedOrigins.length > 0
      ? JSON.stringify(config.allowedOrigins)
      : 'undefined'

  return `${imports}

// One image, any host. Everything is driven by environment variables, so the same container runs on
// a plain VPS, Fly.io, Railway, DigitalOcean, Cloud Run, ECS, or Kubernetes, with no code to edit.
const env = process.env
const kind = env.FLAGS_STORAGE ?? '${defaultStorage}'

async function makeStorage() {
  if (kind === 'postgres') {
    if (!env.DATABASE_URL) throw new Error('FLAGS_STORAGE=postgres requires DATABASE_URL')
    const { Pool } = await import('pg')
    const table = env.FLAGS_TABLE ?? 'flaghoist_flags'
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      // Managed Postgres (Supabase, Neon, Render) requires TLS. Skip this if your URL sets sslmode.
      ssl: /sslmode=/.test(env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
    })
    await initPostgres(pool, table)
    return postgresAdapter(pool, { table })
  }

  if (kind === 'redis') {
    if (!env.REDIS_URL) throw new Error('FLAGS_STORAGE=redis requires REDIS_URL')
    const { default: Redis } = await import('ioredis')
    return redisAdapter(new Redis(env.REDIS_URL), { hashKey: env.FLAGS_HASH_KEY ?? 'flaghoist:flags' })
  }

  if (kind === 'memory') {
    console.warn('[flaghoist] FLAGS_STORAGE=memory: flags are in-process and are lost on restart.')
    return memoryAdapter()
  }

  throw new Error(\`Unknown FLAGS_STORAGE "\${kind}". Use postgres, redis, or memory.\`)
}

const app = createFlagServer({
  storage: await makeStorage(),${dashboard}
  auth: {
    admin: ${adminExpr(config.auth.admin)},
    read: apiKey(env.READ_API_KEY),
  },
  rateLimit: memoryRateLimit(),
  // Comma-separated list of browser origins allowed to read flags cross-origin.
  allowedOrigins: env.FLAGS_CORS ? env.FLAGS_CORS.split(',').map((o) => o.trim()) : ${origins},
})

const port = Number(env.PORT ?? ${CONTAINER_PORT})
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
console.log(\`[flaghoist] listening on :\${port} (storage: \${kind})\`)
`
}

/** Generate the Dockerfile that builds and runs the Node entry. */
export function generateDockerfile(config: FlaghoistConfig): string {
  const defaultStorage = containerStorageDefault(config.storage)
  return `# Flaghoist as a portable container. Build once, run on any host: a VPS, Fly.io, Railway,
# DigitalOcean, Cloud Run, ECS, or Kubernetes. Configure it entirely with environment variables.
FROM node:22-alpine

WORKDIR /app

# Install the published Flaghoist packages. Copying only package.json first keeps this layer cached
# across code changes.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

ENV PORT=${CONTAINER_PORT}
ENV FLAGS_STORAGE=${defaultStorage}
EXPOSE ${CONTAINER_PORT}

# The /health route is unauthenticated, so it makes a good container healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \\
  CMD node -e "fetch('http://127.0.0.1:${CONTAINER_PORT}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
`
}

/** Generate a `package.json` for the container project. */
export function generateContainerPackageJson(config: FlaghoistConfig): string {
  const pkg = {
    name: config.name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { start: 'node server.mjs' },
    dependencies: CONTAINER_DEPS,
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}

/** Generate a `.dockerignore` so the build context stays small and the image excludes local files. */
export function generateDockerignore(): string {
  return ['node_modules', 'npm-debug.log', 'Dockerfile', '.dockerignore', 'README.md', ''].join(
    '\n',
  )
}
