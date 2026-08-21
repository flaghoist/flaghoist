# create-flaghoist

The package behind `npm create flaghoist`. It sets up a new Flaghoist project, which in practice
means writing one config file and telling you what to run next.

```bash
npm create flaghoist@latest team-flags
```

You get a `flaghoist.toml`:

```toml
name = "team-flags"
storage = "cloudflare-kv"

[auth]
admin = "bearer-token"
read = "api-key"
```

That file is the entire project. `npx flaghoist deploy` turns it into a running flag service with an
admin dashboard, and `npx flaghoist eject` turns it into TypeScript you own instead.

## Options

```bash
npm create flaghoist@latest team-flags -- --storage redis
```

Storage can be `cloudflare-kv` (the default), `redis`, `postgres` or `memory`. You can change it
later by editing the config, so it is not a decision you are stuck with.

It will not write into a directory that already has files in it.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
