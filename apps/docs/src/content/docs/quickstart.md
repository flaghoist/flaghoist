---
title: Quickstart
description: Stand up a Flaghoist service on Cloudflare Workers or any container host, then read a flag from your app.
---

There are two parts: stand up the service once for your team, then read flags from your apps.
After that, adding a flag is one CLI command or one click, plus an `if` in your code.

## 1. Create the project

```bash
npm create flaghoist@latest team-flags
cd team-flags
```

This makes the `team-flags` directory and writes `flaghoist.toml` into it, which is the whole
project. Flaghoist runs as its own service rather than a library inside your app, so it wants a
directory of its own. If you already made an empty one, run `npx flaghoist init` inside it instead.

## 2. Deploy it

```bash
npx flaghoist deploy
```

It asks where you are deploying. Pick one of the two paths below.

### Cloudflare Workers

Choose **Cloudflare Workers**. The CLI installs what it needs, creates a KV namespace for your
flags, and deploys, so you end up with a URL like `https://team-flags.<you>.workers.dev`. It runs on
the free plan and costs nothing while nobody is reading flags.

Set the two secrets before your first write:

```bash
npx wrangler secret put ADMIN_TOKEN
```

```bash
npx wrangler secret put READ_API_KEY
```

Use long random values for both (`openssl rand -hex 32`).

### Any other host

Choose **Another platform**. The CLI writes a small Node project (`server.mjs`, a `Dockerfile` and
`package.json`) that runs anywhere a container or Node runs: a VPS, Render, Fly.io, Railway, Cloud
Run, Kubernetes. It is configured entirely with environment variables. To try it on your machine
with flags kept in memory:

```bash
docker build -t team-flags .
```

```bash
docker run -p 8080:8080 -e FLAGS_STORAGE=memory -e ADMIN_TOKEN=change-me-to-something-long -e READ_API_KEY=change-me-too team-flags
```

For real use, point it at Postgres, Redis or SQLite with `FLAGS_STORAGE` and `DATABASE_URL` (or
`REDIS_URL`, or `DATABASE_PATH`). The [Docker guide](/deploy/docker/) lists every variable, and
there are walkthroughs for [Render](/deploy/render/), [Fly.io](/deploy/fly/) and
[Railway](/deploy/railway/).

To skip the question, create the project with `--platform container`, or run
`npx flaghoist deploy --target other`.

Either way, that one URL now serves three things: the OFREP read API your apps use, the admin API,
and the dashboard at `/admin`.

## 3. Open the dashboard

Go to `/admin` on your server and sign in with the admin token. That is fine while it is just you.
When other people need access, [turn on accounts](/accounts/) so everyone signs in as themselves
with their own role.

## 4. Point the CLI at your service

Flag commands need your server's URL and a token. Export them once for the session:

```bash
export FLAGS_URL=https://flags.example.com
export FLAGS_ADMIN_TOKEN=<your admin token>
```

With accounts on, `npx flaghoist login` signs you in instead and saves a personal token.

## 5. Create a flag

```bash
npx flaghoist flag create new-checkout --desc "Redesigned checkout"
```

Flags start **off**, so nothing changes for users until you turn one on. You can also click **New
flag** in the dashboard. Neither needs a code change.

## 6. Read it in your app

Install the client (JavaScript shown; other languages use their own OFREP provider):

```bash
npm install @openfeature/web-sdk @flaghoist/vue
```

Register the provider once at startup:

```ts
import { OpenFeature } from '@openfeature/web-sdk'
import { FlaghoistProvider } from '@flaghoist/vue'

await OpenFeature.setProviderAndWait(
  new FlaghoistProvider({
    url: import.meta.env.VITE_FLAGS_URL,
    apiKey: import.meta.env.VITE_FLAGS_KEY,
  }),
)
OpenFeature.setContext({ targetingKey: user.id })
```

Then use it anywhere:

```vue
<script setup lang="ts">
import { useFeatureFlag } from '@flaghoist/vue'
const newCheckout = useFeatureFlag('new-checkout')
</script>

<template>
  <NewCheckout v-if="newCheckout" />
  <LegacyCheckout v-else />
</template>
```

## 7. Release it

Turn the flag on, roll it out to a percentage, or add a targeting rule, from the dashboard or the
CLI. None of it needs a deploy:

```bash
npx flaghoist flag toggle new-checkout --on
npx flaghoist flag rollout new-checkout 25
```

Users pick up the change the next time their app fetches flags.

## Other languages

The read API is OFREP, so any language with an OpenFeature provider reads flags without a
Flaghoist package. Each verified language has a guide with install steps and a working example:
[Go](/clients/go/), [Python](/clients/python/), [Java](/clients/java/), [.NET](/clients/dotnet/),
[Ruby](/clients/ruby/), [Rust](/clients/rust/) and [JavaScript / TypeScript](/clients/javascript/).
The [overview](/clients/overview/) covers the read key and evaluation context they share.

## Next

- [Accounts and team access](/accounts/): invites, roles, single sign-on and two-factor codes.
- [Environments](/self-hosting/#environments): production and staging from one server.
- [Self-hosting](/self-hosting/): what `flaghoist.toml` controls, and ejecting to your own code.
