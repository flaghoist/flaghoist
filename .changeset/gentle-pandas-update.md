---
'@flaghoist/provider-web': patch
'@flaghoist/server': patch
'flaghoist': patch
---

Pick up patch updates to the runtime dependencies these packages ship.

`@flaghoist/server` moves to `hono` 4.13.3 and `jose` 6.2.9, `flaghoist` to `smol-toml` 1.8.0, and
`@flaghoist/provider-web` to `@openfeature/ofrep-web-provider` 0.4.3. The bumps landed on `main`
already; without a release they sit there and nobody installing from npm gets them.

No behaviour of ours changes. `@flaghoist/vue` and `create-flaghoist` come along because they depend
on `@flaghoist/provider-web` and `flaghoist` respectively.
