---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
'@flaghoist/core': minor
'flaghoist': minor
---

Add invites and member management for user accounts. Admins create single-use invite links
(bound to one email, valid 7 days by default via `users.invites.expiresInDays`) and pass them on
themselves; opening one sets a password and signs in. A new Members page and
`flaghoist users` commands change roles, disable, enable and remove members, and create 24-hour
password reset links that sign out the member's other sessions. Only an owner can grant or act on
the owner role, the last active owner cannot be demoted, disabled or removed, and nobody can
change their own role. Demoting or disabling a member signs them out. Link tokens are stored only
as hashes. Every change is recorded in the security log.

The dashboard now follows the signed-in role: viewers see flags read-only, editors do not see
import or delete, and Webhooks and Members appear only for admins and owners.
