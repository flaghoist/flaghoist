---
title: Quickstart
description: Stand up a Flaghoist service and read a flag from your app in five minutes.
---

There are two things to do: **stand up the service once** for your team, and **read flags** from
your apps. After the service exists, adding a flag is a one-line CLI call plus a `v-if`.

## 1. Stand up the service (once, for your team)

```bash
npm create flaghoist@latest team-flags
cd team-flags
npx flaghoist deploy
# → https://team-flags.you.workers.dev
```

That URL now serves three things at once: the OFREP read API, the admin API, and the dashboard at
`/admin`. It scales to zero when nobody is reading flags.

Set the two secrets before your first write:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put READ_API_KEY
```

## 2. Create a flag

From the terminal:

```bash
flaghoist flag create new-checkout --off --desc "Redesigned checkout"
```

…or click **New flag** in the dashboard. No code change is required to register a flag.

## 3. Read it in your app

Install the client (JavaScript shown; other languages use their official OFREP provider):

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

## 4. Release it

Toggle the flag on, drag the rollout to 25%, or add a targeting rule — from the dashboard or the
CLI, no deploy:

```bash
flaghoist flag toggle new-checkout --on
flaghoist flag rollout new-checkout 25
```

Users pick up the change on their next page load.

## Other languages

Because the server speaks OFREP, any language with an OpenFeature OFREP provider works with no
Flaghoist-specific package. For example, in Go:

```go
provider := ofrep.NewProvider("https://team-flags.you.workers.dev",
    ofrep.WithHeaderProvider(func() (string, string) { return "x-api-key", apiKey }))
openfeature.SetProvider(provider)
enabled := client.Boolean(ctx, "new-checkout", false, evalCtx)
```
