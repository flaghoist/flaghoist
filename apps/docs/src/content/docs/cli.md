---
title: CLI reference
description: Scaffold, deploy, and manage flags from the terminal.
---

The `flaghoist` CLI scaffolds and deploys your service and manages flags against a running server.

## Scaffolding

```bash
flaghoist init       # asks a few questions, then writes flaghoist.toml
flaghoist eject      # generate a code project you own
flaghoist deploy     # deploy: prompts for the platform (Cloudflare, or another host)
```

### Setup questions

`init` and `npm create flaghoist@latest` ask the same questions, and Enter takes the default:

| Question           | Default             | Flag                               |
| ------------------ | ------------------- | ---------------------------------- |
| Project name       | `team-flags`        | `--name`                           |
| Where it runs      | Cloudflare Workers  | `--platform cloudflare\|container` |
| Storage            | depends on platform | `--storage`                        |
| Accounts and roles | on                  | `--no-accounts`                    |
| Single sign-on     | off                 | `--sso-issuer`, `--sso-client-id`  |
| SSO admin group    | none                | `--sso-admin-group`                |
| Dashboard          | on                  | `--no-dashboard`                   |

The storage list only shows what the chosen platform can reach: Cloudflare KV, Redis (Upstash),
Postgres (Neon) or memory on Workers, and Postgres, Redis, SQLite or memory in a container.

With accounts on, setup needs an `AUTH_PEPPER`: a long random secret the server mixes into every
password hash, so a copy of the database alone is not enough to crack passwords. Setup generates
one, or you can paste your own (at least 32 characters). It is printed once for your password
manager and written to `.env`, which setup adds to `.gitignore`. It never goes in `flaghoist.toml`.
Keep it the same for the life of the server; changing it breaks every existing password.

With SSO on, setup asks for the issuer URL, client ID, the group whose members become admins, and
the client secret. The secret goes in `.env` next to the pepper.

Pass flags to skip questions, or `-y` to take the defaults for everything left. Without a terminal
(a script or CI) setup takes the defaults and never prints the pepper.

`deploy` on Cloudflare sets `AUTH_PEPPER` and `SSO_CLIENT_SECRET` on the Worker from `.env` after
the first deploy. A secret the Worker already has is left alone. On a container host, pass `.env`
with `docker run --env-file .env` locally and add the same values to your host's secrets.

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
same options.

## Flag management

These commands talk to a server's admin API. Provide the server and admin token via flags or
environment variables:

```bash
export FLAGS_URL=https://flags.example.com
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

## Signing in

On a server with [user accounts](/accounts/) turned on, sign in once instead of passing a
token each time:

```bash
flaghoist login --url https://flags.example.com
```

It asks for your email and password (the password is hashed locally and never sent), creates a
personal access token named after this machine, and saves it in `~/.config/flaghoist/credentials.json`
(or `%APPDATA%\flaghoist` on Windows; set `FLAGHOIST_CONFIG_DIR` to move it), readable only by
you. After that, commands for that server need no token, and no `--url` if it is the only one you
have signed in to. `--token` and `FLAGS_ADMIN_TOKEN` still take priority. In a script, or anywhere without an interactive terminal, pipe the password in with
`--password-stdin`: `flaghoist login --url ... --email ... --password-stdin < password.txt`.

If the account uses two-factor codes, `flaghoist login` asks for the current code after the
password; pass it with `--code` where there is no terminal. A recovery code works too.

`flaghoist logout` revokes the token on the server and removes it from the file.

| Command                                                        | Description                           |
| -------------------------------------------------------------- | ------------------------------------- |
| `flaghoist tokens list`                                        | Your access tokens and when last used |
| `flaghoist tokens create <name> [--role R] [--expires-days N]` | Create one; `N` can be `never`        |
| `flaghoist tokens revoke <id or name>`                         | Revoke one                            |

## Members

On a server with [user accounts](/accounts/) turned on, with the same `FLAGS_URL` and a
token for the admin role or higher:

| Command                                          | Description                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `flaghoist users list`                           | Members and open invites                                              |
| `flaghoist users invite <email> [--role <role>]` | Print an invite link (role defaults to viewer)                        |
| `flaghoist users role <email> <role> [--env E]`  | Change a role; with `--env`, in one environment (`default` clears it) |
| `flaghoist users disable <email>`                | Block sign-in and end their sessions                                  |
| `flaghoist users enable <email>`                 | Allow sign-in again                                                   |
| `flaghoist users remove <email>`                 | Remove a member                                                       |
| `flaghoist users reset <email>`                  | Print a password reset link (valid 24 hours)                          |
| `flaghoist users revoke <email>`                 | Cancel an open invite                                                 |

Links point at the dashboard the server serves at `/admin`.

## Example

```bash
flaghoist flag create new-checkout --desc "Redesigned checkout"
flaghoist flag rollout new-checkout 25
flaghoist flag toggle new-checkout --on
```
