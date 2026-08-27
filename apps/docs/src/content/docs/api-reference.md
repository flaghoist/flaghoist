---
title: API reference
description: The OFREP read endpoints and the admin CRUD endpoints.
---

## Read path (OFREP)

Guarded by the read API key (`x-api-key` header). Returns evaluated booleans only.

### `POST /ofrep/v1/evaluate/flags`

Evaluate every flag for a context.

```bash
curl -X POST https://team-flags.you.workers.dev/ofrep/v1/evaluate/flags \
  -H "x-api-key: $READ_KEY" -H "content-type: application/json" \
  -d '{ "context": { "targetingKey": "user-1", "plan": "beta" } }'
```

```json
{ "flags": [{ "key": "new-checkout", "value": true, "reason": "DEFAULT", "variant": "on" }] }
```

### `POST /ofrep/v1/evaluate/flags/{key}`

Evaluate a single flag. Returns `404` with `errorCode: FLAG_NOT_FOUND` for an unknown key.

## Admin path

Guarded by the admin verifier (bearer token or OIDC). This is Flaghoist's own **versioned** API:
build dashboards, scripts, and integrations against it.

| Method   | Path                 | Purpose                  |
| -------- | -------------------- | ------------------------ |
| `GET`    | `/api/v1/flags`      | List all flags           |
| `GET`    | `/api/v1/flags/:key` | Get one flag             |
| `PUT`    | `/api/v1/flags/:key` | Create or replace a flag |
| `DELETE` | `/api/v1/flags/:key` | Delete a flag            |

The unversioned `/flags` paths remain as a legacy alias of `/api/v1/flags`.

`PUT` is a full replace (creation metadata is preserved). Send the complete desired state:

```bash
curl -X PUT https://team-flags.you.workers.dev/api/v1/flags/new-checkout \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{
    "enabled": true,
    "rollout": { "percentage": 25 },
    "description": "Redesigned checkout",
    "rules": [
      {
        "conditions": [{ "attribute": "plan", "operator": "eq", "value": "beta" }],
        "result": { "enabled": true, "rollout": { "percentage": 50 } }
      }
    ]
  }'
```

### Conditional writes (optimistic concurrency)

`GET /api/v1/flags/:key` returns an `ETag`, and every flag carries a `metadata.updatedAt` that the
ETag is derived from. To avoid two editors silently overwriting each other, send that ETag back on
`PUT` as `If-Match`:

```bash
curl -X PUT https://team-flags.you.workers.dev/api/v1/flags/new-checkout \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -H 'If-Match: "2026-08-27T10:15:00.000Z"' \
  -d '{ "enabled": false, "rollout": { "percentage": 0 } }'
```

If the flag changed since you read it, the write is refused with **`412 Precondition Failed`** instead
of clobbering the other edit; reload and reapply. `If-Match: *` requires the flag to still exist. A
`PUT` with no `If-Match` is unconditional (last write wins), so existing clients are unaffected. The
admin dashboard sends `If-Match` automatically.

## Other endpoints

| Method | Path                   | Auth | Purpose                           |
| ------ | ---------------------- | ---- | --------------------------------- |
| `GET`  | `/health`              | none | Health check                      |
| `GET`  | `/admin`               | none | The dashboard SPA (if configured) |
| `GET`  | `/api/v1/openapi.json` | none | The OpenAPI 3.1 spec (see below)  |

## Flag schema

```ts
interface FeatureFlag {
  key: string
  enabled: boolean
  rollout: { percentage: number } // the default rule
  rules?: TargetingRule[] // ordered, first match wins
  description: string
  metadata: { createdBy: string; createdAt: string; updatedBy: string; updatedAt: string }
}
```

Operators available in conditions: `eq`, `neq`, `in`, `notIn`, `contains`, `startsWith`,
`endsWith`, `gt`, `gte`, `lt`, `lte`, `semverGte`, `semverLt`.

## OpenAPI

Every server describes itself. Fetch the machine-readable spec from a running server:

```bash
curl https://team-flags.you.workers.dev/api/v1/openapi.json
```

It is an OpenAPI 3.1 document covering the admin API, the OFREP read endpoints, and the schemas
above, so you can point Swagger UI, Postman, or a client generator at it. The same document is
exported from the package for build-time tooling:

```ts
import { openApiDocument } from '@flaghoist/server'
```
