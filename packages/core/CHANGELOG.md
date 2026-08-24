# @flaghoist/core

## 0.1.2

### Patch Changes

- cdc0d7b: Three hardening fixes from a security audit.
  
  The admin dashboard now keeps the session token in `sessionStorage` rather than `localStorage`, so
  the token dies with the browser tab instead of sitting on disk. It is full admin authority with no
  expiry, and `localStorage` is readable by any script on the origin, so a smaller window is the safer
  default. The sign-in URL field already defaults to the current origin, so nothing is lost by not
  persisting it.
  
  A flag description is now bounded to 2048 characters. It was unbounded within the 64KB request body
  limit, so an authenticated writer could bloat every `list()` and every dashboard load, since the
  list returns full flag bodies with no pagination. `parseFlag` rejects a flag over the cap and the
  admin write path returns a specific error.
  
  `apiKey` and `bearerToken` warn once, to the server log, when the shared secret is under 16
  characters. Flaghoist does not rate limit authentication, so a short token is guessable; the warning
  is guidance rather than a wall, since rejecting a short secret outright could lock an operator out of
  a running service. The secret is never retained: the dedupe key is a short hash of it.

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
