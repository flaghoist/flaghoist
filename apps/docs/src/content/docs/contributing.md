---
title: Contributing
description: How to build, test, and contribute to Flaghoist.
---

Flaghoist is Apache-2.0 and community-driven. Contributions are very welcome.

## Development

It is a pnpm + Turborepo monorepo:

```bash
corepack enable
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Run one package's tests with a filter:

```bash
pnpm --filter @flaghoist/core test
```

### A local server

To run a real Flaghoist server on your machine — to `curl`, point the browser examples at, or
manage with the CLI — use:

```bash
pnpm dev:server   # → http://localhost:8787
```

It uses the in-memory adapter, seeds a couple of flags, opens CORS to the Vite dev ports, and serves
the dashboard at `/admin` if you have run `pnpm build`. The read key is `read-key` and the admin
token is `admin`; override with `PORT`, `READ_API_KEY`, `ADMIN_TOKEN`, or `FLAGS_CORS`.

## Good first contributions

- **New storage adapters.** Implement the four-method `StorageAdapter` for a database we do not
  ship yet (DynamoDB, Deno KV, SQLite, MongoDB…). Copy an existing adapter, and make it pass the
  shared conformance suite — that is the whole spec.
- **OFREP language guides.** Document using Flaghoist from Go, Python, Java, .NET, PHP, or Ruby via
  the official OpenFeature OFREP providers.
- **Examples.** A minimal runnable app in a framework we do not cover yet.

## Pull requests

1. Branch from `main`.
2. Add a changeset for any user-facing change: `pnpm changeset`.
3. Make sure `pnpm build`, `pnpm test`, and `pnpm typecheck` pass.
4. Sign off your commits (`git commit -s`) per the DCO.

`main` is always releasable. Keep changes small and, where it makes sense, behind flags — we
develop Flaghoist the way Flaghoist is meant to be used.

## Reporting security issues

Please report vulnerabilities privately — see
[SECURITY.md](https://github.com/flaghoist/flaghoist/blob/main/SECURITY.md). Do not open a public
issue for security reports.
