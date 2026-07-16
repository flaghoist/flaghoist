<p align="center">
  <img src="./brand/banner.svg" alt="Flaghoist — hoist your own feature flags" width="100%" />
</p>

<p align="center">
  <strong>Hoist your own feature flags.</strong><br />
  An open-source, OpenFeature-native feature-flag service you deploy on your own infrastructure in five minutes — for $0.
</p>

<p align="center">
  <a href="https://github.com/flaghoist/flaghoist/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://github.com/flaghoist/flaghoist/actions"><img src="https://img.shields.io/badge/CI-passing-brightgreen.svg" alt="CI" /></a>
  <a href="https://openfeature.dev"><img src="https://img.shields.io/badge/OpenFeature-native-000.svg" alt="OpenFeature native" /></a>
  <img src="https://img.shields.io/badge/status-pre--alpha-orange.svg" alt="Status: pre-alpha" />
</p>

---

> **Status: pre-alpha, under active construction.** APIs will change without notice until 0.1.0. Stars
> and early feedback are hugely welcome; production use is not recommended yet.

## What is Flaghoist?

Flaghoist is a feature-flag service you **own**. It runs on your infrastructure (Cloudflare Workers by
default, or any Node/Bun/Deno runtime), stores flags in **any fast database you point it at** (Workers
KV by default), and speaks the **OpenFeature Remote Evaluation Protocol (OFREP)** — so every language
with an OpenFeature provider works with it on day one, without Flaghoist writing a single per-language
SDK.

- **$0 idle** — scale-to-zero on the Cloudflare free tier. No always-on server, no database bill.
- **OpenFeature-native** — standard SDKs everywhere; swap Flaghoist for LaunchDarkly/Datadog with one provider line.
- **Bring your own DB** — a storage adapter is four methods (`get`/`put`/`delete`/`list`). KV, Redis, DynamoDB, Postgres, or your own.
- **Targeting from day one** — boolean flags, sticky percentage rollouts, and ordered targeting rules.
- **A dashboard in the box** — a single deploy gives you the read API, the admin API, and a management UI.

## Why not just use X?

|                 | LaunchDarkly    | Flagsmith / Unleash          | flagd              | **Flaghoist**                       |
| --------------- | --------------- | ---------------------------- | ------------------ | ----------------------------------- |
| Model           | SaaS, paid      | Self-host, server + Postgres | Sidecar, no UI     | Serverless, edge-first, BYO storage |
| Idle cost       | Subscription    | A running server + DB        | A sidecar per pod  | **$0 (scale-to-zero)**              |
| Management UI   | Yes             | Yes                          | No                 | **Yes, self-hosted**                |
| Standard        | Proprietary SDK | OF providers                 | OpenFeature-native | **OpenFeature + OFREP native**      |
| Your data lives | Their cloud     | Your DB                      | Files              | **Your DB, your account**           |

## Quickstart

```bash
# 1. Stand up your own flag service (once, for your whole team)
npm create flaghoist@latest team-flags
cd team-flags && npx flaghoist deploy        # → https://team-flags.you.workers.dev

# 2. In your app, install the client
npm install @openfeature/web-sdk @flaghoist/vue
```

```ts
// 3. Wire the provider once, at startup
import { OpenFeature } from '@openfeature/web-sdk'
import { FlaghoistProvider } from '@flaghoist/vue'

await OpenFeature.setProviderAndWait(
  new FlaghoistProvider({
    url: import.meta.env.VITE_FLAGS_URL,
    apiKey: import.meta.env.VITE_FLAGS_KEY,
  }),
)
```

```vue
<!-- 4. Use it anywhere -->
<script setup lang="ts">
import { useFeatureFlag } from '@flaghoist/vue'
const newCheckout = useFeatureFlag('new-checkout')
</script>

<template>
  <NewCheckout v-if="newCheckout" />
  <LegacyCheckout v-else />
</template>
```

Full docs: **[docs.flaghoist.dev](https://docs.flaghoist.dev)** _(coming soon)_.

## Monorepo layout

```
packages/
  core/                 @flaghoist/core — schema, evaluation engine, interfaces (zero deps)
  server/               @flaghoist/server — Hono app: OFREP + admin CRUD + dashboard
  adapters/
    memory/             @flaghoist/adapter-memory — dev/test/fallback
    cloudflare-kv/      @flaghoist/adapter-cloudflare-kv — default storage
    redis/              @flaghoist/adapter-redis — ioredis (Node) or Upstash (edge)
    postgres/           @flaghoist/adapter-postgres — jsonb table via node-postgres
  providers/
    web/                @flaghoist/provider-web — OpenFeature web SDK provider
    node/               @flaghoist/provider-node — OpenFeature server SDK provider
  vue/                  @flaghoist/vue — useFeatureFlag() composable
  cli/                  flaghoist — scaffold, deploy, and manage flags
apps/                   dashboard (Vue), web + docs (Astro)
examples/               vue, react, node, worker
```

## Development

```bash
corepack enable
pnpm install
pnpm build         # build all packages
pnpm test          # run all tests
pnpm typecheck     # type-check all packages
```

## Contributing

Flaghoist is Apache-2.0 and community-driven. New storage adapters and OFREP language guides are
excellent first contributions — see [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[Apache-2.0](./LICENSE) © Damilola Oluwafemi and the Flaghoist contributors.

Flaghoist is not affiliated with or endorsed by the OpenFeature project or the CNCF.
