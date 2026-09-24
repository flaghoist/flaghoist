---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
---

Add admin roles. An admin verifier can now return a `role` (`viewer`, `editor`, `admin` or
`owner`), and every admin route checks it: viewers read, editors change flags, admins also delete,
import and manage webhooks. A refused request gets a 403 with `code: "insufficient_role"`, which
`ApiError.code` now exposes. A verifier that returns no role keeps full access, so `bearerToken`,
`oidc` and existing custom verifiers behave exactly as before.
