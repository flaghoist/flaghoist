---
'@flaghoist/core': minor
'@flaghoist/server': minor
'@flaghoist/adapter-memory': minor
---

Add an audit log. Every flag create, update and delete is recorded with its actor and a before and
after snapshot, and served at `GET /api/v1/audit` behind admin auth, with `limit`, `offset`,
`flagKey` and `action` query parameters. Storage adapters can persist it through the new optional
`appendAudit` and `listAudit` methods, which the memory adapter implements; otherwise the server
keeps recent entries in memory. The dashboard gains an audit log page.
