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

Guarded by the admin verifier (bearer token or OIDC). Full flag configuration.

| Method   | Path          | Purpose                  |
| -------- | ------------- | ------------------------ |
| `GET`    | `/flags`      | List all flags           |
| `GET`    | `/flags/:key` | Get one flag             |
| `PUT`    | `/flags/:key` | Create or replace a flag |
| `DELETE` | `/flags/:key` | Delete a flag            |

`PUT` is a full replace (creation metadata is preserved). Send the complete desired state:

```bash
curl -X PUT https://team-flags.you.workers.dev/flags/new-checkout \
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

## Other endpoints

| Method | Path      | Auth | Purpose                           |
| ------ | --------- | ---- | --------------------------------- |
| `GET`  | `/health` | none | Health check                      |
| `GET`  | `/admin`  | none | The dashboard SPA (if configured) |

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
