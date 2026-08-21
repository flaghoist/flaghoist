---
'flaghoist': minor
---

Create the KV namespace during `flaghoist deploy`, so the quickstart works on the first try.

A fresh project's `wrangler.toml` carried a literal `<your-kv-namespace-id>`, so on the default
`cloudflare-kv` storage the very first command in the README failed: wrangler rejected the
placeholder, and nothing in the CLI output or the docs said that `wrangler kv namespace create
FLAGS` had to be run first. The generated file had a comment pointing at it, which you only saw
after the command had already failed.

`deploy` now creates the namespace itself and writes the real id back into `wrangler.toml`. It only
does this while the placeholder is there, so an id you pasted in yourself is never touched and
repeat deploys reuse the namespace rather than making a new one. If wrangler fails, or prints an id
this cannot read, the deploy stops with the manual command rather than continuing into a failure.

`eject` prints the same command, since an ejected project runs wrangler on its own.
