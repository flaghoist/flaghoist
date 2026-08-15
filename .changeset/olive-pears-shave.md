---
'create-flaghoist': minor
'flaghoist': minor
---

Add `create-flaghoist`, so `npm create flaghoist@latest team-flags` works.

npm rewrites `npm create <name>` to the package `create-<name>`, so the command developers
reflexively type — the convention Vite, Astro, Nuxt and Next all trained them on — was resolving to
a package that did not exist and returning a 404. It scaffolds the directory (which `flaghoist init`
does not) and writes `flaghoist.toml` into it.

The `flaghoist` CLI now also exposes its config helpers (`serializeConfig`, `parseConfig`,
`DEFAULT_CONFIG`, `STORAGE_KINDS`) as a library entry point. The scaffolder writes the config with
the same serializer the CLI parses it back with, so the two cannot drift into a file one side
writes and the other cannot read.
