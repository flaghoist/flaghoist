# @flaghoist/adapter-memory

Keep Flaghoist flags in memory. Useful for tests, local development, and anywhere you want a flag
server that starts clean every time.

```bash
npm install @flaghoist/adapter-memory
```

```ts
import { memoryAdapter } from '@flaghoist/adapter-memory'
import { createFlagServer } from '@flaghoist/server'

const app = createFlagServer({
  storage: memoryAdapter(),
  auth: {/* ... */},
})
```

You can seed it, which is what makes it pleasant in tests:

```ts
memoryAdapter([{ key: 'new-checkout', enabled: true, rollout: { percentage: 100 }, rules: [] }])
```

Everything disappears when the process exits. That is the point, but it does mean this is not the
one to reach for in production. Webhook endpoints and audit entries are kept in memory too, with the
same lifetime as the flags.

It is validated by the same conformance suite as the other adapters, so it behaves like the real
thing rather than like a stub that drifts.

## Status

Beta. The core is feature-complete and ready for real projects. The API can still change before
1.0, and every breaking change is called out in the changelog, so pin your versions and read the
notes when you upgrade. If something breaks, an issue is genuinely useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
