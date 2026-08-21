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
