---
'@flaghoist/adapter-cloudflare-kv': minor
'@flaghoist/adapter-postgres': minor
'@flaghoist/adapter-memory': minor
'@flaghoist/provider-node': minor
'@flaghoist/provider-web': minor
'@flaghoist/adapter-redis': minor
'@flaghoist/server': minor
'@flaghoist/core': minor
'@flaghoist/vue': minor
'create-flaghoist': minor
'flaghoist': minor
---

First published release: every package goes out together at 0.1.0.

The packages are only useful as a set, so releasing a subset would ship broken installs.
`@flaghoist/server` depends on `@flaghoist/core`, `@flaghoist/vue` depends on
`@flaghoist/provider-web`, `create-flaghoist` depends on `flaghoist`, and the project the CLI
generates depends on `@flaghoist/server` plus whichever storage adapter you picked. Any of those
left unpublished is an install failure for someone following the quickstart.

`flaghoist --version` now reports the version from `package.json` instead of a hardcoded `0.0.0`,
so a version in a bug report means something.

Treat 0.1.0 as an alpha in everything but the version number: it is a real release on `latest` so
that the documented commands work as written, but the API is not stable and will change.
