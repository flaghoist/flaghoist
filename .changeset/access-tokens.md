---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
'@flaghoist/core': minor
'flaghoist': minor
---

Add personal access tokens. Members create `fh_pat_` tokens for the CLI, the MCP server and
scripts, from the Account page or `POST /api/v1/tokens`. A token acts as its owner, so changes are
attributed to them; it can have a lower role than its owner but never a higher one, and the owner's
current role caps it on every request, so demoting, disabling or removing someone narrows or stops
their tokens. Tokens expire after 90 days by default (1 to 3650 days, or never on purpose), are
stored only as hashes, show when they were last used, and are audited when created, revoked or
expired.

The CLI adds `flaghoist login` (email and password, hashed locally; saves a token in the user
config folder, readable only by you), `flaghoist logout` (revokes it), and
`flaghoist tokens list | create | revoke`. Commands fall back to the saved token when no `--token`
or `FLAGS_ADMIN_TOKEN` is given.
