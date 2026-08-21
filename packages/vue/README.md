# @flaghoist/vue

Read Flaghoist flags in a Vue 3 app.

This is a thin layer over OpenFeature. It gives you a `useFeatureFlag()` composable that returns a
reactive ref, and a provider that is already wired to talk to your Flaghoist server.

```bash
npm install @flaghoist/vue @openfeature/web-sdk
```

Register the provider once, at startup:

```ts
import { OpenFeature } from '@openfeature/web-sdk'
import { FlaghoistProvider } from '@flaghoist/vue'

await OpenFeature.setContext({ targetingKey: 'user-123', plan: 'pro' })
await OpenFeature.setProviderAndWait(
  new FlaghoistProvider({
    url: import.meta.env.VITE_FLAGS_URL,
    apiKey: import.meta.env.VITE_FLAGS_KEY,
  }),
)
```

Then read flags anywhere:

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

The ref updates when the provider becomes ready and when its configuration changes. Note that
background polling is off by default in the underlying OpenFeature provider, so flags refresh when
the page becomes visible again rather than on a timer. Pass `pollInterval` if you want a timer.

Use the read only API key here, never the admin token. It ships to the browser.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
