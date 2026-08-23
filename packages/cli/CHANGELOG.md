# flaghoist

## 0.1.2

### Patch Changes

- 62407d6: Make `flaghoist deploy` work on a fresh project, and stop the KV namespace name colliding.

  Both of these were found by running the documented quickstart against a real Cloudflare account for
  the first time. Neither showed up against a stubbed wrangler.

  `deploy` wrote a `package.json` and a Worker that imports from it, then went straight to
  `wrangler deploy` without installing anything. The bundler could not resolve `@flaghoist/server`
  and the deploy failed before it reached Cloudflare, so `npm create flaghoist` followed by
  `npx flaghoist deploy` could never have worked. It now installs first, and skips that once the
  directory has a `node_modules`.

  The KV namespace was created with the title `FLAGS`. Titles are unique per Cloudflare account, so
  the first project in an account worked and every one after it failed on a name it never chose,
  including the separate staging and production instances the docs recommend. The title is now
  scoped to the project name, for example `team-flags-FLAGS`. The binding inside the Worker is still
  `FLAGS`, so nothing about the generated code changes.

## 0.1.1

### Patch Changes

- 642917a: Give every package a README, plus the metadata npm needs to link it back here.

  npm reads `README.md` from the package directory rather than the repo root, so all eleven published
  with an empty page telling people to add one. Each package now has its own, written for someone
  landing on npm cold rather than someone who has already read the root README.

  Also adds `keywords`, `repository` (with `directory`), `homepage` and `bugs`. `flaghoist` had no
  keywords at all, so it did not come up in an npm search for feature flags, and nothing linked any
  package back to the repository or the issue tracker.

  Also drops the unused `version` export from `@flaghoist/core`. It was hardcoded to `'0.0.0'`, so it
  kept saying that after the package published as `0.1.0`. Nothing in the repo imported it, and a
  value that has to be kept in step by hand is worse than no value at all. If a version export earns
  its place later it should be generated at build time, since `createRequire` is not available in the
  Workers and browser runtimes this package targets.

## 0.1.0

### Minor Changes

- e13bd69: First published release: every package goes out together at 0.1.0.

  The packages are only useful as a set, so releasing a subset would ship broken installs.
  `@flaghoist/server` depends on `@flaghoist/core`, `@flaghoist/vue` depends on
  `@flaghoist/provider-web`, `create-flaghoist` depends on `flaghoist`, and the project the CLI
  generates depends on `@flaghoist/server` plus whichever storage adapter you picked. Any of those
  left unpublished is an install failure for someone following the quickstart.

  `flaghoist --version` now reports the version from `package.json` instead of a hardcoded `0.0.0`,
  so a version in a bug report means something.

  Treat 0.1.0 as an alpha in everything but the version number: it is a real release on `latest` so
  that the documented commands work as written, but the API is not stable and will change.

- 1a638e4: Create the KV namespace during `flaghoist deploy`, so the quickstart works on the first try.

  A fresh project's `wrangler.toml` carried a literal `<your-kv-namespace-id>`, so on the default
  `cloudflare-kv` storage the very first command in the README failed: wrangler rejected the
  placeholder, and nothing in the CLI output or the docs said that `wrangler kv namespace create
FLAGS` had to be run first. The generated file had a comment pointing at it, which you only saw
  after the command had already failed.

  `deploy` now creates the namespace itself and writes the real id back into `wrangler.toml`. It only
  does this while the placeholder is there, so an id you pasted in yourself is never touched and
  repeat deploys reuse the namespace rather than making a new one. If wrangler fails, or prints an id
  this cannot read, the deploy stops with the manual command rather than continuing into a failure.

  `eject` prints the same command, since an ejected project runs wrangler on its own.

- 64c55a3: Add `create-flaghoist`, so `npm create flaghoist@latest team-flags` works.

  npm rewrites `npm create <name>` to the package `create-<name>`, so the command developers
  reflexively type — the convention Vite, Astro, Nuxt and Next all trained them on — was resolving to
  a package that did not exist and returning a 404. It scaffolds the directory (which `flaghoist init`
  does not) and writes `flaghoist.toml` into it.

  The `flaghoist` CLI now also exposes its config helpers (`serializeConfig`, `parseConfig`,
  `DEFAULT_CONFIG`, `STORAGE_KINDS`) as a library entry point. The scaffolder writes the config with
  the same serializer the CLI parses it back with, so the two cannot drift into a file one side
  writes and the other cannot read.

- c58f8e4: Ship the admin dashboard with `flaghoist deploy` and `flaghoist eject`, so `/admin` works out of the
  box.

  The server has always been able to serve the dashboard, through `config.dashboard`, but the CLI
  never set it. A Worker from a fresh `flaghoist deploy` answered `/admin` with "Dashboard not
  configured" and a 404, one line below where the quickstart told you to open it. The message pointed
  at a setting that could not be reached from the path the docs prescribed: there was no dashboard key
  in `flaghoist.toml` and no flag on the CLI.

  `@flaghoist/server` now exports the prebuilt single-file dashboard as `dashboardHtml` from
  `@flaghoist/server/dashboard`, and the generated Worker imports it. It is a separate entry point, so
  a deployment that does not want the UI never pulls the HTML into its bundle.

  The dashboard is on by default. Set `dashboard = false` in `flaghoist.toml` to generate a Worker
  that serves the read and admin APIs alone. Configs written before this release have no such key and
  keep serving the dashboard, which is the documented behaviour.
