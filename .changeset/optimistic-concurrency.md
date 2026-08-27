---
'@flaghoist/server': minor
---

Optimistic concurrency on the admin API. `GET /api/v1/flags/:key` now returns an `ETag` (derived from
the flag's `updatedAt`, which is kept strictly increasing), and `PUT /api/v1/flags/:key` honours
`If-Match`: a write whose token no longer matches the stored flag is refused with `412 Precondition
Failed` instead of silently overwriting another edit. `If-Match: *` requires the flag to still exist.
A `PUT` with no `If-Match` stays unconditional (last write wins), so the CLI and existing clients are
unaffected. The bundled dashboard sends `If-Match` on every edit and, on a conflict, reloads and asks
the operator to reapply.
