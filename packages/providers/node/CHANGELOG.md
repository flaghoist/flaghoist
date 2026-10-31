# @flaghoist/provider-node

## 0.2.1

### Patch Changes

- 49aeb08: Flaghoist is in beta. Every package README now says so: the core is feature-complete and ready for
  real projects, the API can still change before 1.0, and every breaking change is called out in the
  changelog. No code changes.

## 0.2.0

### Minor Changes

- c1215c5: Fetch every flag for a context in one request, instead of one request per flag check.
  
  A handler that checked three flags used to make three round trips to the server, each one counting
  against the rate limit, so under load checks could quietly fall back to their defaults. The provider
  now calls the OFREP bulk endpoint once per evaluation context and answers each check from that
  result. Checks that arrive while the request is in flight share it, and the result is reused for 5
  seconds per context.
  
  New options: `cacheTtlMs` (default 5000), `maxCachedContexts` (default 1000), and `bulk: false` to
  keep the old one-request-per-check behaviour. A flag missing from the server returns
  `FLAG_NOT_FOUND` with your default, a failed request returns defaults without being cached, and a
  `429` pauses requests until `Retry-After` has passed.
- 3ed51a5: Pass every option of the official OFREP server provider through: `timeoutMs`, `headersFactory`,
  `query` and `fetchImplementation`, with the upstream defaults. They apply to the bulk request as
  well as to `bulk: false`. The options now have the same shape as `@flaghoist/provider-web`.

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
