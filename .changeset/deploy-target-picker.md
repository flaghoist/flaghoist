---
'flaghoist': minor
---

`flaghoist deploy` now asks where to deploy. Cloudflare Workers stays the built-in one-command path;
choosing another platform prints links to the deployment guides (starting with Render) for running
the same server on Node or a container. Skip the prompt with `--target cloudflare` or `--target
other`, and when the command is not attached to a terminal it defaults to Cloudflare, so scripted
`npm create flaghoist` and CI flows are unchanged.
