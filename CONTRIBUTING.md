# Contributing to Flaghoist

Thanks for helping build an open feature-flag service. This project is Apache-2.0 and community-driven.

## Ground rules

- Be kind. We follow the [Contributor Covenant](./CODE_OF_CONDUCT.md).
- All contributions are made under the Apache-2.0 license (see [DCO](#developer-certificate-of-origin) below).
- Discuss large changes in an issue before opening a big PR.

## Development setup

Flaghoist is a pnpm + Turborepo monorepo.

```bash
corepack enable
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Run a single package's tests with a filter:

```bash
pnpm --filter @flaghoist/core test
```

## Project layout

See the monorepo layout in the [README](./README.md#monorepo-layout). In short: `packages/core` holds
the schema and evaluation engine (zero dependencies), `packages/server` is the Hono app, `adapters/*`
implement storage, `providers/*` are the OpenFeature bindings, and `apps/*` are the dashboard and site.

## Good first contributions

- **New storage adapters.** Implement the four-method `StorageAdapter` interface from `@flaghoist/core`
  for a database we don't ship yet (Redis, DynamoDB, Postgres, SQLite, MongoDB…). Copy `adapter-memory`
  as a starting point and make it pass the shared conformance suite.
- **OFREP language guides.** Document using Flaghoist from Go, Python, Java, .NET, PHP, or Ruby via the
  official OpenFeature OFREP providers.
- **Examples.** A minimal, runnable app in a framework we don't cover yet.

## Pull requests

1. Fork and branch from `main`.
2. Add a changeset for any user-facing change: `pnpm changeset`.
3. Make sure `pnpm build`, `pnpm test`, and `pnpm typecheck` pass.
4. Open the PR with a clear description and link any related issue.

`main` is always releasable. Keep changes small and behind flags where it makes sense — we develop
Flaghoist the way Flaghoist is meant to be used.

## Developer Certificate of Origin

By contributing, you certify the [DCO](https://developercertificate.org/): that you wrote the change or
otherwise have the right to submit it under the project's license. Sign off your commits with `-s`:

```bash
git commit -s -m "feat(adapter): add redis adapter"
```
