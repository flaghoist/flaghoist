# @flaghoist/server

The Flaghoist server, as a function you call. It returns a [Hono](https://hono.dev) app, so it runs
on Cloudflare Workers, Node, Bun, Deno, or anywhere else Hono runs.

Most people never install this directly. The `flaghoist` CLI generates a Worker that uses it. Reach
for it when you want to compose the server yourself, add middleware, or plug in your own auth.

```bash
npm install @flaghoist/server @flaghoist/adapter-cloudflare-kv
```

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

## What it serves

- `POST /ofrep/v1/evaluate/flags` and `/flags/:key`, the OFREP read path, behind the read API key.
- `/api/v1/flags`, the admin CRUD API, behind admin auth, with an OpenAPI 3.1 document at
  `/api/v1/openapi.json`.
- `/admin`, the dashboard, when you pass one.

## The dashboard

The prebuilt admin UI ships in the same package, on its own entry point:

```ts
import { dashboardHtml } from '@flaghoist/server/dashboard'

createFlagServer({ storage, auth, dashboard: dashboardHtml })
```

It lives on a subpath rather than the package root, so a deploy that does not want the UI never
pulls the HTML into its bundle. It is a single self contained file with the fonts and styles
inlined, and it makes no requests to anything outside your server.

## Auth

`bearerToken`, `apiKey` and `oidc` ship with it. Auth is an interface, so if none of those fit, pass
your own function.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
