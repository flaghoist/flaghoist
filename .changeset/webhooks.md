---
'@flaghoist/core': minor
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
'@flaghoist/adapter-memory': minor
'@flaghoist/adapter-cloudflare-kv': minor
'@flaghoist/adapter-redis': minor
'@flaghoist/adapter-sqlite': minor
'@flaghoist/adapter-postgres': minor
---

Add webhooks. Manage endpoints under `/api/v1/webhooks` or from the dashboard's Webhooks page. Each
flag create, update, delete, archive or restore sends a `POST` signed with HMAC-SHA256 in
`X-Flaghoist-Signature`, using a secret generated per endpoint. Delivery is fire-and-forget with a
10 second timeout and no retries.

Storage adapters persist endpoints through new optional `putWebhook`, `getWebhook`,
`deleteWebhook` and `listWebhooks` methods, which all five shipped adapters implement.
`initSqlite` and `initPostgres` also create a `flaghoist_webhooks` table.
