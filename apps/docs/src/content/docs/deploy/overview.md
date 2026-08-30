---
title: Deployment targets
description: Flaghoist runs on Cloudflare Workers, Node, Bun, Deno, or a container. Pick where your storage lives.
---

`createFlagServer` returns a [Hono](https://hono.dev) app, so Flaghoist runs anywhere Hono runs. The
only thing that changes between hosts is where the app serves from and which storage adapter it
points at. You are not locked to Cloudflare.

| Target                         | Storage                      | How                                                    |
| ------------------------------ | ---------------------------- | ------------------------------------------------------ |
| **Cloudflare Workers**         | Workers KV (bundled)         | The one-command path: [Quickstart](/quickstart/)       |
| **Node, Bun, Deno, container** | Postgres, Redis, or memory   | Serve the app yourself: [Self-hosting](/self-hosting/) |
| **Render**                     | Render Postgres or Key Value | [Deploy to Render](/deploy/render/)                    |

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

## More platforms

Fly.io, Railway, and a prebuilt Docker image are on the way, and they all follow the pattern above. If
you need one that is not documented yet, open an issue at
[github.com/flaghoist/flaghoist](https://github.com/flaghoist/flaghoist/issues).
