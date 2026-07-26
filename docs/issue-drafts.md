# Issue drafts

Ready-to-file GitHub issues, written before launch so the tracker is populated the day the repo
goes public. An empty tracker reads as abandoned; a tracker with well-scoped, obviously-doable work
converts drive-by visitors into contributors — which is the only real fix for a bus factor of one.

File these with `gh issue create --title … --body … --label …`, or paste them by hand.

Labels used: `good first issue`, `help wanted`, `adapter`, `docs`, `example`, `enhancement`.

---

## 1. Storage adapter: DynamoDB

**Labels:** `good first issue`, `help wanted`, `adapter`

Flaghoist stores flags through a four-method `StorageAdapter`, so it can run on whatever database
you already operate. We ship Cloudflare KV, Redis, Postgres, and an in-memory adapter. DynamoDB is
the most requested gap — it's the natural fit for teams already on AWS, and pairs well with running
the server on Lambda or a container.

**The contract** (`packages/core/src/types.ts`):

```ts
export interface StorageAdapter {
  get(key: string): Promise<FeatureFlag | null>
  put(key: string, flag: FeatureFlag): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<FeatureFlag[]>
}
```

That's the whole interface. For reference, the entire Redis adapter is **71 lines of source and 78
lines of test** — this is a genuinely small piece of work, not a slog.

**How to do it**

1. Copy `packages/adapters/redis/` to `packages/adapters/dynamodb/` as your skeleton.
2. Name the package `@flaghoist/adapter-dynamodb`; export a factory `dynamoDbAdapter(client, opts)`.
3. Take the DynamoDB client as a **parameter**, don't construct it. Every adapter here is injectable
   so it stays testable and so users control credentials, region, and connection reuse.
4. Accept a minimal structural type (see `RedisClientLike` in the Redis adapter) rather than
   depending on the full AWS SDK — that keeps the package dependency-light and lets tests use a
   fake.
5. Store one item per flag. `list()` should `Scan` (or `Query` a fixed partition key); a single
   partition with the flag key as sort key is fine — flag counts are small.

**How you'll know it's right**

The conformance suite is the executable contract. In `test/index.test.ts`:

```ts
import { testStorageAdapter } from '@flaghoist/adapter-conformance'

testStorageAdapter('dynamodb', () => dynamoDbAdapter(new FakeDynamo()))
```

If that passes, the adapter is correct. Please also add a short section to
`apps/docs/src/content/docs/storage-adapters.md`.

Happy to review a draft PR early if you'd rather check the shape before finishing. Questions welcome
in the issue.

---

## 2. Storage adapter: SQLite

**Labels:** `good first issue`, `help wanted`, `adapter`

A SQLite adapter makes Flaghoist trivially runnable on a single VPS or in a container with a mounted
volume — no external database at all. It's also the best adapter for local development against
something persistent, and a natural fit for Bun and Deno users.

Same four-method contract and same instructions as the DynamoDB issue above — copy
`packages/adapters/redis/` (71 lines) as the skeleton, take the database handle as a parameter, and
prove it with `testStorageAdapter('sqlite', …)` from `@flaghoist/adapter-conformance`.

**Specific notes**

- Target a structural type compatible with both `node:sqlite` and `better-sqlite3` so users can pick.
- One table, e.g. `flags(key TEXT PRIMARY KEY, json TEXT NOT NULL)`. Store the serialized flag; the
  schema deliberately stays dumb so flag-shape changes don't need migrations.
- Create the table lazily on first use so there's no separate migration step.

---

## 3. Storage adapter: Deno KV

**Labels:** `good first issue`, `help wanted`, `adapter`

Flaghoist's server is a Hono app, so it already runs on Deno — but there's no first-class storage
option there. Deno KV would make Deno Deploy a genuine one-command target alongside Cloudflare
Workers, and it's the closest analogue to our default KV adapter.

Same contract and process as above. Start from `packages/adapters/cloudflare-kv/` rather than Redis
for this one — the semantics are closer.

**Specific notes**

- Key flags under a prefix, e.g. `["flaghoist", "flags", key]`, so `list()` is a bounded
  `kv.list({ prefix })`.
- Take the `Deno.Kv` handle as a parameter, as with every other adapter.
- Keep the package free of Deno-only imports at the type level where practical so it still typechecks
  in the monorepo's Node-based CI.

---

## 4. Storage adapter: MongoDB

**Labels:** `good first issue`, `help wanted`, `adapter`

For teams already running MongoDB who'd rather not add another datastore just for flags.

Same contract and process as the DynamoDB issue. One document per flag, `key` as a unique index,
`list()` is a bare `find({})`. Take the collection as a parameter.

---

## 5. Guide: use Flaghoist from Go

**Labels:** `good first issue`, `help wanted`, `docs`

Flaghoist's read path implements
[OFREP](https://openfeature.dev/specification/appendix-c), which means **every language with an
OpenFeature OFREP provider already works** — no Flaghoist-specific SDK required. That's the single
most under-communicated thing about this project, and the fix is documentation, not code.

We want a short guide per language. Go is the highest-value one to write first.

**What the guide should cover**

1. Install the official OpenFeature Go SDK and its OFREP provider.
2. Point the provider at a Flaghoist server URL and pass the read API key as a header.
3. Set an evaluation context with a `targetingKey` (this is what makes percentage rollouts sticky
   and targeting rules work).
4. Read a boolean flag.
5. One gotcha section — whatever you hit while actually running it.

There's a short Go snippet at the bottom of `apps/docs/src/content/docs/quickstart.md` to start
from. Add the page under `apps/docs/src/content/docs/` and link it in the sidebar.

**Please actually run it against a local server** rather than writing from the docs — you can start
one with `pnpm dev:server` from the repo root. The point of the guide is that it's verified.

---

## 6. Guide: use Flaghoist from Python

**Labels:** `good first issue`, `help wanted`, `docs`

Same as the Go guide above, for Python: the official OpenFeature Python SDK plus its OFREP provider,
pointed at a Flaghoist server. Same structure, same requirement that it's been run for real.

(Java, .NET, PHP, and Ruby guides are equally welcome — comment here and we'll open a matching
issue so two people don't write the same one.)

---

## 7. Example app: React

**Labels:** `good first issue`, `help wanted`, `example`

`examples/` has Vue, Node, and Worker apps but no React one, even though React is the most likely
starting point for someone evaluating Flaghoist.

Notably this needs **no new Flaghoist package** — React works through the standard
`@openfeature/react-sdk` and its `useFlag` hook, which is exactly the point we want to demonstrate:
you don't need us to ship a binding for every framework.

**How to do it**

- Mirror `examples/vue/` in structure, scripts, and README so the examples stay consistent.
- Use `@openfeature/react-sdk` with `@flaghoist/provider-web`.
- Show a `targetingKey` being set, so the example demonstrates targeting and not just an on/off
  boolean.
- Add it to the table in `examples/README.md`.

Run it against a local server with `pnpm dev:server` (from the repo root), which seeds a
`new-checkout` flag and a `beta` flag with a targeting rule.

---

## 8. Docs: auth recipes for hosted identity providers

**Labels:** `help wanted`, `docs`

Flaghoist ships a pluggable `oidc()` verifier for the admin path that works with any standard OIDC
provider, but `apps/docs/src/content/docs/auth.md` only documents the generic shape. Real setups
stall on provider-specific details — which claim carries groups, what the issuer URL actually is,
how to scope an audience.

Recipes wanted for: **Auth0**, **Okta**, **Keycloak**, **Microsoft Entra**, **AWS Cognito**, and
**Cloudflare Access**.

Each should be short and concrete: the exact `oidc({ issuer, audience, groupsClaim, allowedGroups })`
config for that provider, plus the one screen in their console where you find those values. One
provider per PR is perfect — no need to do them all.
