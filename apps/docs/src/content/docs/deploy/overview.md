---
title: Deployment targets
description: Flaghoist runs on Cloudflare Workers, Node, Bun, Deno, or a container. Pick where your storage lives.
---

`createFlagServer` returns a [Hono](https://hono.dev) app, so Flaghoist runs anywhere Hono runs. The
only thing that changes between hosts is where the app serves from and which storage adapter it
points at. You are not locked to Cloudflare.

| Target                             | Storage                      | How                                                       |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------- |
| **Cloudflare Workers**             | Workers KV (bundled)         | The one-command path: [Quickstart](/quickstart/)          |
| **Docker** (any container host)    | Postgres, Redis, or memory   | One portable image: [Deploy with Docker](/deploy/docker/) |
| **Render**                         | Render Postgres or Key Value | [Deploy to Render](/deploy/render/)                       |
| **Node, Bun, Deno** (no container) | Postgres, Redis, or memory   | Serve the app yourself: [Self-hosting](/self-hosting/)    |

The **Docker** image is the least locked-in option: one artifact runs on a VPS, Fly.io, Railway,
DigitalOcean, Cloud Run, ECS, or Kubernetes, configured entirely by environment variables.

The CLI scaffolds whichever shape you target. `npx flaghoist deploy` asks where you are shipping:
**Cloudflare Workers** deploys in one command, and **Another platform** scaffolds the container
project (`server.mjs`, `Dockerfile`, `package.json`) and points you at the host guides below. Pick the
container up front with `npm create flaghoist@latest team-flags -- --platform container`. See the
[CLI reference](/cli/#platforms).

## The pattern for any host

Every non-Cloudflare deployment is the same shape: serve the `createFlagServer()` app and give it a
storage adapter.

```ts
import { serve } from '@hono/node-server'
import { postgresAdapter } from '@flaghoist/adapter-postgres'
import { apiKey, bearerToken, createFlagServer } from '@flaghoist/server'

const app = createFlagServer({
  storage: postgresAdapter(pool),
  auth: { admin: bearerToken(process.env.ADMIN_TOKEN), read: apiKey(process.env.READ_API_KEY) },
})

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 })
```

Cloudflare Workers cannot hold long-lived TCP connections, so a traditional Postgres or Redis is
reached from a Node, Bun, or container deployment rather than from a Worker. HTTP-based stores such as
Upstash and Neon work from Workers directly.

## Host-specific guides

These run the [Docker image](/deploy/docker/) on a specific host:

- [Fly.io](/deploy/fly/)
- [Railway](/deploy/railway/)
- [Render](/deploy/render/)

Any other container host works the same way. If you want a walkthrough that is not written yet, open
an issue at [github.com/flaghoist/flaghoist](https://github.com/flaghoist/flaghoist/issues).
