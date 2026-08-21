---
'flaghoist': patch
---

Make `flaghoist deploy` work on a fresh project, and stop the KV namespace name colliding.

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
