---
'create-flaghoist': minor
'flaghoist': minor
---

Platform-aware scaffolding. `flaghoist deploy` now scaffolds a project that fits the target you pick:
Cloudflare Workers as before, or a container (a `@hono/node-server` entry plus a `Dockerfile`) when
you choose another platform. The container runs on any container or Node host, configured by
environment variables, and the platform is written back to `flaghoist.toml` so a re-run or an
`eject` keeps producing the same shape.

- `flaghoist init` and `npm create flaghoist` take `--platform cloudflare|container`.
- `flaghoist eject` generates the container file set (`server.mjs`, `Dockerfile`, `.dockerignore`,
  `package.json`) for a container project, and the Worker set otherwise.
- `flaghoist deploy` with "Another platform" (or `--target other`) scaffolds the container and prints
  the next steps rather than only linking to docs. It does not deploy: container hosts differ enough
  that their own guides own the last mile.

A container project cannot use Cloudflare KV, so its storage defaults to postgres. Existing projects
are unaffected: an absent `platform` means Cloudflare, and a Worker config serializes exactly as
before.
