# @flaghoist/adapter-cloudflare-kv

## 0.2.1

### Patch Changes

- Updated dependencies [cdc0d7b]
  - @flaghoist/core@0.1.2

## 0.2.0

### Minor Changes

- df906d0: Store flags under their own key by default, instead of namespacing them with `flag:`.
  
  A flag called `checkout` is now the KV key `checkout`, so browsing the namespace in the Cloudflare
  dashboard shows what you expect. Searching for a flag by name used to find nothing, because the key
  was really `flag:checkout` and nothing said so.
  
  Namespacing is still available and is now the caller's decision:
  
  ```ts
  cloudflareKV(env.FLAGS, { prefix: 'flag:' })
  ```
  
  That is the right shape for it. Sharing a KV namespace with other data is a choice you make about
  your own infrastructure, and only you know whether you have. Without a prefix, `list()` reads every
  key in the namespace; values that are not flags are skipped rather than appearing as broken rows, so
  a shared namespace degrades rather than breaks, but you pay a read for each foreign key.
  
  **This is breaking for an existing deployment.** Flags written under `flag:` are invisible to an
  adapter that is no longer looking there. They are still in KV. To keep them, pass
  `{ prefix: 'flag:' }` explicitly and nothing changes.

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

### Patch Changes

- Updated dependencies [e13bd69]
  - @flaghoist/core@0.1.0
