---
'@flaghoist/adapter-cloudflare-kv': patch
'@flaghoist/adapter-postgres': patch
'@flaghoist/adapter-memory': patch
'@flaghoist/provider-node': patch
'@flaghoist/provider-web': patch
'@flaghoist/adapter-redis': patch
'@flaghoist/server': patch
'@flaghoist/core': patch
'@flaghoist/vue': patch
'create-flaghoist': patch
'flaghoist': patch
---

Give every package a README, plus the metadata npm needs to link it back here.

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
