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
dashboard = true

[auth]
admin = "bearer-token"
read = "api-key"
```

```bash
npx flaghoist deploy
```

The CLI generates a Worker from the config and hands off to `wrangler`. You own no code.

On the default `cloudflare-kv` storage, the first deploy also creates the KV namespace the Worker
binds to, by running `wrangler kv namespace create FLAGS` in your account, and writes the id it gets
back into `wrangler.toml`. Later deploys see a real id there and leave it alone, so the namespace is
created once and your flags survive every deploy after it. To use a namespace you already have, put
its id in `wrangler.toml` yourself and the step is skipped.

## Model A: eject to a code project

When you need a custom adapter, custom auth, or middleware, drop to a project you own:

```bash
npx flaghoist eject
```

This writes `src/index.ts`, `wrangler.toml`, and `package.json`. Ejecting hands you the wrangler
commands too, so on `cloudflare-kv` create the namespace once and paste the id into
`wrangler.toml`:

```bash
npx wrangler kv namespace create FLAGS
```

The entrypoint composes the server explicitly:

```ts
import { cloudflareKV } from '@flaghoist/adapter-cloudflare-kv'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'
import { dashboardHtml } from '@flaghoist/server/dashboard'

export default createFlagServer((env) => ({
  storage: cloudflareKV(env.FLAGS),
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKey(env.READ_API_KEY),
  },
  dashboard: dashboardHtml,
}))
```

Every line is yours to change, including the dashboard import: drop it and `/admin` stops being
served.

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

Both `flaghoist deploy` and `flaghoist eject` wire the dashboard in for you, so `/admin` works on a
fresh deploy with nothing to configure. To ship the APIs without the UI, turn it off in
`flaghoist.toml`:

```toml
dashboard = false
```

Composing the server yourself? Import the prebuilt bundle from its own entry point and pass it as
`config.dashboard`:

```ts
import { dashboardHtml } from '@flaghoist/server/dashboard'

createFlagServer({ storage, auth, dashboard: dashboardHtml })
```

It lives on a subpath rather than the package root, so a deploy that leaves it out never pulls the
HTML into its bundle.

## Environments

Use one storage namespace (or database) per environment, e.g. `flags-staging` and
`flags-production`, so changes never leak across environments.
