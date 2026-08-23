# @flaghoist/server

## 0.1.3

### Patch Changes

- e1bc451: Report `STATIC` rather than `DISABLED` on the OFREP wire for a disabled flag, so every language
  agrees on what the flag is worth.
  
  OpenFeature clients read `DISABLED` as "this flag is not participating, use the default you passed
  in". The Go OFREP provider acts on that: it discarded the `value: false` we sent and returned the
  caller's default instead. The JavaScript provider honoured the value. The same flag on the same
  server answered `false` in JavaScript and `true` in Go.
  
  It fails in the worst place. A kill switch is usually written as `BooleanValue(ctx, "feature", true)`,
  on unless we turn it off, so a Go service kept serving a feature after it had been disabled, while
  the dashboard showed it off.
  
  Flaghoist means something narrower than OpenFeature does. A disabled flag is off and the value is
  false, not "no opinion". `STATIC` says the value did not come from dynamic evaluation, which is
  true, and carries no instruction to substitute anything.
  
  Only the OFREP response changes. `evaluate()` still returns `DISABLED`, and the admin API is
  untouched, so nothing loses the distinction internally.

## 0.1.2

### Patch Changes

- 8aff467: Pick up patch updates to the runtime dependencies these packages ship.
  
  `@flaghoist/server` moves to `hono` 4.13.3 and `jose` 6.2.9, `flaghoist` to `smol-toml` 1.8.0, and
  `@flaghoist/provider-web` to `@openfeature/ofrep-web-provider` 0.4.3. The bumps landed on `main`
  already; without a release they sit there and nobody installing from npm gets them.
  
  No behaviour of ours changes. `@flaghoist/vue` and `create-flaghoist` come along because they depend
  on `@flaghoist/provider-web` and `flaghoist` respectively.

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

- Updated dependencies [642917a]
  - @flaghoist/core@0.1.1

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

### Patch Changes

- Updated dependencies [e13bd69]
  - @flaghoist/core@0.1.0
