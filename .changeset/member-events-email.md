---
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
'@flaghoist/core': minor
'flaghoist': minor
---

Add member events on webhooks and an optional email sender. Webhooks can subscribe to
`member.invited`, `member.joined`, `member.role_changed`, `member.disabled`, `member.enabled` and
`member.removed`, with a `member` object in the payload. They are opt-in and never part of the
default event list, so existing receivers only ever see flag events. Sign-ins, passwords, two-factor
and access tokens are never sent to webhooks.

`users.email` takes an object with `send({ to, subject, text, html })`; invites and password reset
links are then emailed as well as shown, to the dashboard address the admin is using when its origin
is allowed. No provider is bundled; the docs show Resend and Postmark in a few lines. A failed send
is logged and the link still returned, and responses say whether the link was `emailed`.
