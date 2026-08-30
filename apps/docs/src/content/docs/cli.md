---
title: CLI reference
description: Scaffold, deploy, and manage flags from the terminal.
---

The `flaghoist` CLI scaffolds and deploys your service and manages flags against a running server.

## Scaffolding

```bash
flaghoist init [--name <name>] [--storage cloudflare-kv|redis|postgres|memory] [--platform cloudflare|container]
flaghoist eject      # generate a code project you own
flaghoist deploy     # deploy: prompts for the platform (Cloudflare, or another host)
```

### Platforms

Flaghoist scaffolds a project that fits where you are shipping it:

- **`cloudflare`** (the default): a Cloudflare Worker plus a `wrangler.toml`. `deploy` creates the KV
  namespace and ships it in one command with wrangler.
- **`container`**: a Node entry (`server.mjs`) served by `@hono/node-server`, plus a `Dockerfile`.
  The same image runs on any container or Node host (Render, Fly.io, Railway, a VPS), configured by
  environment variables. Cloudflare KV is a Worker binding, so a container project cannot use it; its
  storage defaults to postgres.

`deploy` asks where to ship. **Cloudflare Workers** is the built-in one-command path (wrangler). Pick
**another platform** and it scaffolds the container project (`server.mjs`, `Dockerfile`,
`.dockerignore`, `package.json`) and prints the next steps, then hands off to the
[deployment guides](/deploy/overview/) such as [Render](/deploy/render/), [Fly.io](/deploy/fly/), and
[Railway](/deploy/railway/) for the last mile. It does not deploy the container for you, because
those hosts each build and run it their own way.

Skip the prompt with `--target cloudflare` or `--target other`. When the command is not attached to a
terminal (a script or CI) it defaults to Cloudflare, unless the project's `flaghoist.toml` already
records a container platform, in which case it scaffolds that. The chosen platform is written back to
`flaghoist.toml`, so a re-run or an `eject` keeps producing the same shape.

### Where files land

`init` writes `flaghoist.toml` into the current directory; `eject` and `deploy` add the project files
beside it (`src/index.ts` + `wrangler.toml` for a Worker, or `server.mjs` + `Dockerfile` for a
container), plus `package.json`. Run them in a directory of the service's own, not inside your
application: they will refuse rather than overwrite files that are already there.
`npm create flaghoist@latest team-flags` makes that directory for you, and takes the same
`--storage` and `--platform` options.

## Flag management

These commands talk to a server's admin API. Provide the server and admin token via flags or
environment variables:

```bash
export FLAGS_URL=https://team-flags.you.workers.dev
export FLAGS_ADMIN_TOKEN=…
```

| Command                                                         | Description                 |
| --------------------------------------------------------------- | --------------------------- |
| `flaghoist flag list`                                           | List flags with their state |
| `flaghoist flag get <key>`                                      | Print a flag as JSON        |
| `flaghoist flag create <key> [--on] [--rollout N] [--desc "…"]` | Create a flag               |
| `flaghoist flag toggle <key> [--on\|--off]`                     | Enable/disable (or flip)    |
| `flaghoist flag rollout <key> <percentage>`                     | Set the default rollout     |
| `flaghoist flag rules set <key> --file rules.json`              | Replace targeting rules     |
| `flaghoist flag delete <key>`                                   | Delete a flag               |

`toggle`, `rollout`, and `rules set` preserve the rest of the flag: they read the current
definition and re-send everything else unchanged.

## Example

```bash
flaghoist flag create new-checkout --desc "Redesigned checkout"
flaghoist flag rollout new-checkout 25
flaghoist flag toggle new-checkout --on
```
