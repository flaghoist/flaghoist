# @flaghoist/provider-web

## 0.2.1

### Patch Changes

- 49aeb08: Flaghoist is in beta. Every package README now says so: the core is feature-complete and ready for
  real projects, the API can still change before 1.0, and every breaking change is called out in the
  changelog. No code changes.

## 0.2.0

### Minor Changes

- 8fd7532: Pass every option of the official OFREP web provider through, instead of dropping all but the URL
  and headers.
  
  `FlaghoistWebProvider` used to accept only `url`, `apiKey` and `headers`, so `pollInterval`,
  `changeDetection`, `cacheMode`, `cacheTTL`, `timeoutMs` and the rest were silently ignored. The
  browser could only refresh flags on a context change or when the tab became visible again, and there
  was no way to choose what users see during an outage. All of them now reach the upstream provider
  with its own defaults, so behaviour without them is unchanged. The constructor also takes the
  upstream provider's optional `logger`.
  
  The README now explains the two choices that matter: `pollInterval` for live updates, and
  `cacheMode` for whether an outage shows the last known values (the default) or your code defaults.

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
