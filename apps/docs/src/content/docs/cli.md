---
title: CLI reference
description: Scaffold, deploy, and manage flags from the terminal.
---

The `flaghoist` CLI scaffolds and deploys your service and manages flags against a running server.

## Scaffolding

```bash
flaghoist init [--name <name>] [--storage cloudflare-kv|redis|postgres|memory]
flaghoist eject      # generate a code project you own
flaghoist deploy     # deploy: prompts for the platform (Cloudflare, or another host)
```

`deploy` asks where to ship. **Cloudflare Workers** is the built-in one-command path (wrangler). Pick
**another platform** and it points you at the [deployment guides](/deploy/overview/), such as
[Render](/deploy/render/), for running the same server on Node or a container. Skip the prompt with
`--target cloudflare` or `--target other`; when the command is not attached to a terminal (a script
or CI) it defaults to Cloudflare.

`init` writes `flaghoist.toml` into the current directory, and `eject` and `deploy` add
`src/index.ts`, `wrangler.toml` and `package.json` beside it. Run them in a directory of the
service's own, not inside your application: they will refuse rather than overwrite files that are
already there. `npm create flaghoist@latest team-flags` makes that directory for you.

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
