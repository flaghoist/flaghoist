---
title: Deploy to Render
description: Run Flaghoist as a Render web service backed by Render Postgres, no Cloudflare account needed.
---

[Render](https://render.com) runs the Node path: a web service serving the Flaghoist app, backed by a
Render Postgres. No Cloudflare account required. About ten minutes end to end.

`npm create flaghoist` defaults to a Cloudflare Worker, so on Render you run the same server on Node
instead and swap Workers KV for Postgres. That is one small entry file and two extra packages, shown
below so you can see exactly what runs.

The CLI can also write this entry for you: scaffold with
`npm create flaghoist@latest team-flags -- --platform container`, or run `npx flaghoist deploy` and
pick **Another platform**, and you get an equivalent `server.mjs` (plus a `Dockerfile` and a
`package.json`). Render can build either the Node entry directly or the container. This guide takes
the Node path by hand; if you scaffolded it, skip step 1 and set `FLAGS_STORAGE=postgres` alongside
the other environment variables in step 3.

## 1. Add the Node entry and its dependencies

In your project:

```bash
npm install @hono/node-server @flaghoist/adapter-postgres pg
```

Create `server.mjs` (the `.mjs` extension, or `"type": "module"` in `package.json`, so the top-level
`await` works):

```js
import { serve } from '@hono/node-server'
import { initPostgres, postgresAdapter } from '@flaghoist/adapter-postgres'
import { apiKey, bearerToken, createFlagServer, memoryRateLimit } from '@flaghoist/server'
import { dashboardHtml } from '@flaghoist/server/dashboard'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
await initPostgres(pool) // creates the flags table on first boot

const app = createFlagServer({
  storage: postgresAdapter(pool),
  dashboard: dashboardHtml,
  auth: {
    admin: bearerToken(process.env.ADMIN_TOKEN),
    read: apiKey(process.env.READ_API_KEY),
  },
  rateLimit: memoryRateLimit(),
  // If a browser app reads flags cross-origin, list its origin so CORS lets it through:
  // allowedOrigins: ['https://your-app.example.com'],
})

const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port })
console.log(`Flaghoist listening on :${port}`)
```

Push the project to a GitHub or GitLab repo. Render deploys from Git.

## 2. Create the database

In the Render dashboard: **New > Postgres**. Name it, pick a region, choose the Free plan, and create
it. When it is ready, copy the **Internal Database URL**.

## 3. Create the web service

**New > Web Service**, connect your repo, and set:

- **Runtime:** Node
- **Build command:** `npm install`
- **Start command:** `node server.mjs`
- **Environment variables:**
  - `DATABASE_URL` = the Internal Database URL from step 2
  - `ADMIN_TOKEN` = a strong secret (`openssl rand -hex 32`)
  - `READ_API_KEY` = another strong secret

`PORT` is set by Render automatically, and the entry reads it. Create the service. Render builds and
gives you an HTTPS URL like `https://your-service.onrender.com`.

## 4. Verify

```bash
curl https://your-service.onrender.com/health
```

Create a flag from the dashboard at `https://your-service.onrender.com/admin` (paste your
`ADMIN_TOKEN`), or from the CLI:

```bash
npx flaghoist flag create new-checkout --on \
  --url https://your-service.onrender.com --token "$ADMIN_TOKEN"
```

Then read it back, exactly as your app would:

```bash
curl -X POST https://your-service.onrender.com/ofrep/v1/evaluate/flags/new-checkout \
  -H "x-api-key: $READ_API_KEY" -H "content-type: application/json" \
  -d '{"context":{"targetingKey":"tester-1"}}'
```

## Optional: a one-file blueprint

Commit a `render.yaml` so a fresh clone deploys with the database wired up automatically:

```yaml
services:
  - type: web
    name: flaghoist
    runtime: node
    buildCommand: npm install
    startCommand: node server.mjs
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: flaghoist-db
          property: connectionString
      - key: ADMIN_TOKEN
        generateValue: true
      - key: READ_API_KEY
        generateValue: true
databases:
  - name: flaghoist-db
    plan: free
```

Render then reads the two generated tokens back to you in the dashboard, and you use them as the
admin and read credentials.

## Good to know on the free tier

- A free web service **spins down after about 15 minutes idle**, so the first request after a quiet
  spell takes 30 to 60 seconds. Fine for a test; a paid instance stays warm.
- Render's **free Postgres is removed after 30 days**. For anything past a short test, use a paid
  database, or Render Key Value (Redis) with [`@flaghoist/adapter-redis`](/storage-adapters/).
- Set `allowedOrigins` if a browser app reads flags cross-origin. Server-side reads need nothing.
