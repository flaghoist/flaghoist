---
title: Self-hosting
description: Deploy Flaghoist to Cloudflare or any Hono-supported runtime.
---

Flaghoist ships as a library and a CLI, with two deployment styles.

## Model B: zero-config (the default)

Your whole project is a `flaghoist.toml`:

```toml
name = "team-flags"
storage = "cloudflare-kv"

[auth]
admin = "bearer-token"
read = "api-key"
```

```bash
npx flaghoist deploy
```

The CLI generates a Worker from the config and hands off to `wrangler`. You own no code.

## Model A: eject to a code project

When you need a custom adapter, custom auth, or middleware, drop to a project you own:

```bash
npx flaghoist eject
```

This writes `src/index.ts`, `wrangler.toml`, and `package.json`. The entrypoint composes the server
explicitly:

```ts
import { cloudflareKV } from '@flaghoist/adapter-cloudflare-kv'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'

export default createFlagServer((env) => ({
  storage: cloudflareKV(env.FLAGS),
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKey(env.READ_API_KEY),
  },
}))
```

## Deploying off Cloudflare

`createFlagServer` returns a Hono app, so it runs anywhere Hono runs. Match your runtime to where
your storage is reachable:

```ts
// Node, beside your Postgres
import { serve } from '@hono/node-server'
import { postgresAdapter } from '@flaghoist/adapter-postgres'

serve(
  createFlagServer({
    storage: postgresAdapter(pool),
    auth: { admin: bearerToken(process.env.ADMIN_TOKEN), read: apiKey(process.env.READ_API_KEY) },
  }),
)
```

Cloudflare Workers cannot hold long-lived TCP connections, so a traditional Postgres/Redis in your
VPC is reached from a Node/Bun/container deployment rather than from a Worker; HTTP-based stores
(Upstash, Neon) work from Workers directly.

## Serving the dashboard

Pass a prebuilt dashboard build to serve the management UI at `/admin` from the same deploy:

```ts
createFlagServer({ storage, auth, dashboard: dashboardHtml })
```

## Environments

Use one storage namespace (or database) per environment, e.g. `flags-staging` and
`flags-production`, so changes never leak across environments.
