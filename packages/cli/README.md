# flaghoist

Feature flags you run yourself. This is the command line tool for setting up a Flaghoist server and
managing the flags on it.

Your whole project is one `flaghoist.toml` file. The CLI turns that into a Cloudflare Worker, or
hands you the code if you would rather own it.

```bash
npm create flaghoist@latest team-flags
cd team-flags
npx flaghoist deploy
```

That gives you an OFREP read API, an admin API, and a dashboard at `/admin`, all from a single
deploy. On Cloudflare KV, the first deploy also creates the KV namespace for you and writes its id
into `wrangler.toml`.

## Managing flags

Point the CLI at your server with `--url` and `--token`, or set `FLAGS_URL` and
`FLAGS_ADMIN_TOKEN`.

```bash
flaghoist flag list
flaghoist flag create new-checkout --desc "The redesigned checkout"
flaghoist flag toggle new-checkout --on
flaghoist flag rollout new-checkout 25
```

Rollouts are sticky. A user who lands inside 25 percent stays inside it as you go to 50, so nobody
flickers in and out between deploys.

## Owning the code

```bash
npx flaghoist eject
```

Writes `src/index.ts`, `wrangler.toml` and `package.json` into your project. From there it is a
normal Worker and the CLI steps out of the way.

Flags are boolean only. There are no multivariate flags, experiments or scheduled rules, and there
is no plan to imply otherwise.

## Status

Pre-alpha, built and maintained by one person. The API can still change without notice, and
production use is not recommended yet. If you try it and something breaks, an issue is genuinely
useful.

Apache-2.0. Part of [Flaghoist](https://github.com/flaghoist/flaghoist).
