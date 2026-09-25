---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
'flaghoist': minor
---

Add roles per environment. With environments configured, a member can have a different role in
some of them, such as editor in staging for a viewer, or read-only in production for an editor.
It applies to that environment's flags, exports, imports and flag history; members, webhooks and
the security log keep using the main role, and owners have full access everywhere. Set it with
`environmentRoles` on `PUT /api/v1/users/{id}`, on the Members page, or with
`flaghoist users role <email> <role> --env <environment>`. Access tokens still cap it, and
`GET /api/v1/auth/me` reports the role per environment so the dashboard follows the environment
being viewed. Changes are recorded in the security log.
