# create-flaghoist

The package behind `npm create flaghoist`. It asks a few questions and writes a Flaghoist project:
a `flaghoist.toml`, and a git-ignored `.env` when there are secrets to keep.

```bash
npm create flaghoist@latest team-flags
```

It asks, with a sensible default on each, so you can press Enter through it:

- **Project name**, defaulting to the directory.
- **Where it runs**: Cloudflare Workers, or a container for any host.
- **Storage**, limited to what that platform can reach. Cloudflare KV, Redis, Postgres or memory on
  Workers; Postgres, Redis, SQLite or memory in a container.
- **Accounts and roles**: on by default, so each person signs in as themselves.
- **Single sign-on**: off by default.
- **Dashboard** at `/admin`: on by default.

The result is a `flaghoist.toml`:

```toml
name = "team-flags"
storage = "cloudflare-kv"

[auth]
admin = "bearer-token"
read = "api-key"

[accounts]
enabled = true
```

That file is the project. `npx flaghoist deploy` turns it into a running flag service with the admin
dashboard, and `npx flaghoist eject` turns it into TypeScript you own instead. It will not write
into a directory that already has files in it.

## Accounts and AUTH_PEPPER

With accounts on, the server needs an `AUTH_PEPPER`: a long random secret it mixes into every
password hash, so a stolen copy of the database is not enough to crack passwords. Setup generates
one (or takes one you paste), prints it once for your password manager, and writes it to a
git-ignored `.env`. It never goes in `flaghoist.toml`.

- On **Cloudflare Workers**, `npx flaghoist deploy` sets it as a Worker secret from `.env`.
- On a **container**, pass `.env` to the host, or run with `docker run --env-file .env`.

Keep it the same for the life of the server, because changing it invalidates every existing
password. To skip accounts entirely, answer no or pass `--no-accounts`.

## Skip the questions

Every prompt has a flag, so a script never has to answer one:

```bash
npm create flaghoist@latest team-flags -- --platform container --storage postgres --no-dashboard
```

The flags are `--name`, `--platform`, `--storage`, `--no-accounts`, `--sso-issuer` /
`--sso-client-id` / `--sso-admin-group`, `--no-dashboard`, and `-y` to take every default. Without a
terminal, such as in CI, it takes the defaults and never prints the pepper.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
