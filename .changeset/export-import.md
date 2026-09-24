---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
---

Add flag export and import. `GET /api/v1/export` returns every active flag as JSON, without
metadata; `POST /api/v1/import` creates or updates up to 500 flags from the same shape and reports
per-flag errors without failing the batch. The admin client adds `exportFlags` and `importFlags`,
and the dashboard adds Export and Import buttons with a preview before anything is written.
