# @flaghoist/core

The evaluation engine behind Flaghoist. Flag schema, targeting rules, percentage rollouts, and the
storage and auth interfaces the rest of the packages build on.

Zero dependencies, and no knowledge of HTTP or of where flags are stored.

You usually get this as a dependency of `@flaghoist/server` rather than installing it yourself.
Install it directly if you are writing a storage adapter, or if you want to evaluate flags in
process without running a server.

```bash
npm install @flaghoist/core
```

```ts
import { evaluate, createFlag } from '@flaghoist/core'

const flag = createFlag('new-checkout', {
  enabled: true,
  rollout: { percentage: 25 },
})

const result = evaluate(flag.flag, { targetingKey: 'user-123', plan: 'pro' })
// { value: true, reason: 'SPLIT', ... }
```

## How evaluation works

Rules are ordered and the first match wins, with conditions inside a rule combined with AND. If no
rule matches, the percentage rollout decides.

Rollouts bucket users with SHA-256 over the targeting key, so the same user always lands in the same
place. Going from 10 percent to 20 percent adds people without reshuffling the ones already in.

Flags are boolean. There are no multivariate values, and evaluation returns a reason so you can tell
why you got what you got.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
