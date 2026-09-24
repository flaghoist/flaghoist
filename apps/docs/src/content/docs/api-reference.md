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

When [environments](#environments) are configured, which environment a request reads from is
decided by the read credential, not by anything in the request body. See below.

## Admin path

Guarded by the admin verifier (bearer token or OIDC). This is Flaghoist's own **versioned** API:
build dashboards, scripts, and integrations against it.

| Method   | Path                         | Purpose                            |
| -------- | ---------------------------- | ---------------------------------- |
| `GET`    | `/api/v1/flags`              | List all flags                     |
| `GET`    | `/api/v1/flags/:key`         | Get one flag                       |
| `PUT`    | `/api/v1/flags/:key`         | Create or replace a flag           |
| `DELETE` | `/api/v1/flags/:key`         | Delete a flag                      |
| `POST`   | `/api/v1/flags/:key/archive` | Archive a flag (soft delete)       |
| `POST`   | `/api/v1/flags/:key/restore` | Restore an archived flag           |
| `GET`    | `/api/v1/export`             | Export active flags as JSON        |
| `POST`   | `/api/v1/import`             | Bulk create/update flags from JSON |
| `GET`    | `/api/v1/audit`              | List audit log entries             |
| `GET`    | `/api/v1/environments`       | List configured environments       |
| `GET`    | `/api/v1/webhooks`           | List webhook endpoints             |
| `POST`   | `/api/v1/webhooks`           | Create a webhook endpoint          |
| `GET`    | `/api/v1/webhooks/:id`       | Get one webhook endpoint           |
| `PUT`    | `/api/v1/webhooks/:id`       | Update a webhook endpoint          |
| `DELETE` | `/api/v1/webhooks/:id`       | Delete a webhook endpoint          |
| `POST`   | `/api/v1/webhooks/:id/test`  | Send a test delivery               |

Every admin path above also exists unversioned (e.g. `/flags`, `/export`, `/webhooks`) as a legacy
alias of its `/api/v1/...` form. New integrations should use `/api/v1`.

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

## Archiving

Deleting is permanent; archiving is not. An archived flag is excluded from `GET /api/v1/flags` and
from evaluation (the read path never sees it), but its definition, history, and key are kept, so it
can be restored later with the same rollout and rules it had.

```bash
curl -X POST https://team-flags.you.workers.dev/api/v1/flags/old-feature/archive \
  -H "authorization: Bearer $ADMIN_TOKEN"

curl -X POST https://team-flags.you.workers.dev/api/v1/flags/old-feature/restore \
  -H "authorization: Bearer $ADMIN_TOKEN"
```

Archiving an already-archived flag (or restoring one that isn't archived) returns `409`. Pass
`?includeArchived=true` to `GET /api/v1/flags` to see archived flags in the list; they carry
`archived: true` and an `archivedAt` timestamp.

## Export and import

Move flag definitions between servers, or keep a copy outside Flaghoist, as plain JSON. Only active
(non-archived) flags are exported, and only `key`, `enabled`, `rollout`, `description`, and `rules`
travel: no metadata, no audit history.

```bash
curl https://team-flags.you.workers.dev/api/v1/export -H "authorization: Bearer $ADMIN_TOKEN" \
  > flags.json
```

```json
{
  "version": 1,
  "exportedAt": "2026-09-20T10:00:00.000Z",
  "flags": [
    { "key": "new-checkout", "enabled": true, "rollout": { "percentage": 25 }, "description": "" }
  ]
}
```

`POST /api/v1/import` takes the same `{ flags: [...] }` shape (the `version` and `exportedAt` fields
are ignored on the way in). A flag whose key already exists is updated in place; a new key is
created. Up to 500 flags per request. Each recorded change shows up in the audit log with
`changeDescription: "Bulk import"`.

```bash
curl -X POST https://team-flags.you.workers.dev/api/v1/import \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  --data-binary @flags.json
```

```json
{ "created": 1, "updated": 0, "errors": [] }
```

A row that fails validation (an unsafe key, a malformed rule) is reported in `errors` and skipped;
it does not stop the rest of the batch. The dashboard's Export/Import buttons on the Flags page wrap
this endpoint, with a preview dialog before anything is written.

## Audit log

Every create, update, delete, archive, and restore is recorded, whether it came from the admin API,
the dashboard, or a bulk import.

```bash
curl "https://team-flags.you.workers.dev/api/v1/audit?limit=20&flagKey=new-checkout" \
  -H "authorization: Bearer $ADMIN_TOKEN"
```

| Query param | Purpose                                                    |
| ----------- | ---------------------------------------------------------- |
| `limit`     | Page size, 1-200. Default 50.                              |
| `offset`    | Pagination offset. Default 0.                              |
| `flagKey`   | Restrict to one flag.                                      |
| `action`    | One of `create`, `update`, `delete`, `archive`, `restore`. |

```json
{
  "entries": [
    {
      "id": "m1a2b3-x9y8z7",
      "timestamp": "2026-09-20T10:00:00.000Z",
      "action": "update",
      "flagKey": "new-checkout",
      "actor": "ada@example.com",
      "previous": { "enabled": false, "rollout": { "percentage": 0 }, "description": "" },
      "current": { "enabled": true, "rollout": { "percentage": 25 }, "description": "" },
      "changeDescription": "Ramping up for the launch"
    }
  ],
  "total": 1
}
```

`actor` is the identity your auth verifier returned (an email for OIDC, `admin` for a bare bearer
token; never `api-key`, since the audit log only covers admin writes). By default
entries live in an in-memory ring buffer (last 500, lost on restart); implement
`appendAudit`/`listAudit` on your storage adapter to persist them (the memory adapter already does,
for local development).

## Webhooks

Get an HTTP callback when a flag changes, instead of polling. Manage endpoints through the admin API
or the dashboard's Webhooks page.

```bash
curl -X POST https://team-flags.you.workers.dev/api/v1/webhooks \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{ "url": "https://your-service.example.com/hooks/flaghoist" }'
```

```json
{
  "id": "a1b2c3d4e5f6a7b8",
  "url": "https://your-service.example.com/hooks/flaghoist",
  "secret": "5f8e...c2a1",
  "events": ["flag.created", "flag.updated", "flag.deleted", "flag.archived", "flag.restored"],
  "enabled": true,
  "createdAt": "2026-09-20T10:00:00.000Z",
  "updatedAt": "2026-09-20T10:00:00.000Z"
}
```

`events` and `enabled` are optional on create (default: every event, enabled). `secret` is generated
server-side and returned once on create; the dashboard lets you reveal it again later since it's kept
in storage, but treat it as a credential. `PUT /api/v1/webhooks/:id` accepts a partial `{ url?,
events?, enabled? }` to update one without resending the rest. `POST /api/v1/webhooks/:id/test`
sends a synthetic `flag.updated` delivery so you can verify your endpoint without touching a real
flag.

### Delivery

Each delivery is a `POST` to your `url` with:

```
Content-Type: application/json
X-Flaghoist-Event: flag.updated
X-Flaghoist-Signature: sha256=<hmac-sha256 hex digest of the raw body, keyed by the webhook's secret>
X-Flaghoist-Webhook-Id: a1b2c3d4e5f6a7b8
```

```json
{
  "event": "flag.updated",
  "timestamp": "2026-09-20T10:00:00.000Z",
  "flag": {
    "key": "new-checkout",
    "enabled": true,
    "rollout": { "percentage": 25 },
    "description": ""
  },
  "actor": "ada@example.com",
  "previous": { "enabled": false, "rollout": { "percentage": 0 }, "description": "" },
  "environment": "staging"
}
```

Verify the signature by recomputing the HMAC over the exact raw request body with your `secret`, and
comparing in constant time. `previous` is omitted for `flag.created`; `environment` is omitted
unless you have [environments](#environments) configured. Delivery is fire-and-forget with a 10s
timeout and no retries: a failing endpoint is skipped silently rather than blocking the write that
triggered it, so treat webhooks as a notification, not a guaranteed log. Use the audit log for that.

## Environments

Partition flags into named environments (`production`, `staging`, `development`, ...) on one
server, one storage backend: the same key can be on in staging and off in production, each with its
own audit trail. Configure them once at startup:

```ts
createFlagServer({
  storage: cloudflareKV(env.FLAGS),
  environments: ['production', 'staging', 'development'],
  auth: {
    admin: bearerToken(env.ADMIN_TOKEN),
    read: apiKeys({
      production: env.READ_KEY_PROD,
      staging: env.READ_KEY_STAGING,
      development: env.READ_KEY_DEV,
    }),
  },
})
```

Omit `environments` entirely to run with a single, unnamed environment exactly as before. This is
opt-in, and existing deployments need no migration.

### Admin path

Choose an environment with the `X-Flaghoist-Environment` header on any admin request. Omit it to use
the default (`production`, or whatever `defaultEnvironment` names):

```bash
curl https://team-flags.you.workers.dev/api/v1/flags \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "x-flaghoist-environment: staging"
```

An unrecognized environment name returns `400`. `GET /api/v1/environments` reports what's
configured:

```json
{ "environments": ["production", "staging", "development"], "default": "production" }
```

### Read path (OFREP)

The read side has no environment header. Which environment a request reads from is decided by the
API key itself, via `apiKeys()` (one secret per environment) instead of the single-secret `apiKey()`.
A key that doesn't map to a configured environment, or a plain `apiKey()` verifier, always reads the
default environment. This means a leaked staging key cannot read production flags.

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
  archived?: boolean // true once archived; absent otherwise
  archivedAt?: string // set alongside archived
  environment?: string // absent means the default environment; see Environments below
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
