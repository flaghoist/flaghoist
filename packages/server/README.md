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
  `/api/v1/openapi.json`. Also covers archive/restore, JSON export/import, and the audit log.
- `/api/v1/webhooks`, HMAC-signed HTTP callbacks fired on flag changes.
- `/api/v1/environments`, when `environments` is configured — named environments (`production`,
  `staging`, ...) sharing one storage backend, with per-environment read keys via `apiKeys()`.
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

`bearerToken`, `apiKey`, `apiKeys` and `oidc` ship with it. `apiKeys` maps one read secret per
environment (`apiKeys({ production: '...', staging: '...' })`) instead of a single shared one, so a
leaked staging key can't read production. Auth is an interface, so if none of those fit, pass your
own function.

## Environments

Pass `environments: ['production', 'staging', ...]` to partition flags without a second deploy or a
second database: the same key can be on in staging and off in production, each with its own audit
trail. The default environment uses bare storage keys, so turning this on for an existing deployment
needs no migration. See [docs.flaghoist.dev](https://docs.flaghoist.dev/api-reference/#environments)
for the full picture.

## Webhooks

Manage endpoints under `/api/v1/webhooks` (or the dashboard's Webhooks page). Each delivery is a
signed `POST`: `X-Flaghoist-Signature: sha256=<hmac>` over the raw body, keyed by a secret generated
per webhook. Fire-and-forget with a 10s timeout and no retries — treat it as a notification, not a
guaranteed log.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
