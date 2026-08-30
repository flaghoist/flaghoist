# create-flaghoist

## 0.1.4

### Patch Changes

- Updated dependencies [356343e]
  - flaghoist@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [8aff467]
- Updated dependencies [806975b]
  - flaghoist@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [62407d6]
  - flaghoist@0.1.2

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
  - flaghoist@0.1.1

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

- 64c55a3: Add `create-flaghoist`, so `npm create flaghoist@latest team-flags` works.

  npm rewrites `npm create <name>` to the package `create-<name>`, so the command developers
  reflexively type — the convention Vite, Astro, Nuxt and Next all trained them on — was resolving to
  a package that did not exist and returning a 404. It scaffolds the directory (which `flaghoist init`
  does not) and writes `flaghoist.toml` into it.

  The `flaghoist` CLI now also exposes its config helpers (`serializeConfig`, `parseConfig`,
  `DEFAULT_CONFIG`, `STORAGE_KINDS`) as a library entry point. The scaffolder writes the config with
  the same serializer the CLI parses it back with, so the two cannot drift into a file one side
  writes and the other cannot read.

### Patch Changes

- Updated dependencies [e13bd69]
- Updated dependencies [1a638e4]
- Updated dependencies [64c55a3]
- Updated dependencies [c58f8e4]
  - flaghoist@0.1.0
