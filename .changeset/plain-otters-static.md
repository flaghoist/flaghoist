---
'@flaghoist/server': patch
---

Report `STATIC` rather than `DISABLED` on the OFREP wire for a disabled flag, so every language
agrees on what the flag is worth.

OpenFeature clients read `DISABLED` as "this flag is not participating, use the default you passed
in". The Go OFREP provider acts on that: it discarded the `value: false` we sent and returned the
caller's default instead. The JavaScript provider honoured the value. The same flag on the same
server answered `false` in JavaScript and `true` in Go.

It fails in the worst place. A kill switch is usually written as `BooleanValue(ctx, "feature", true)`,
on unless we turn it off, so a Go service kept serving a feature after it had been disabled, while
the dashboard showed it off.

Flaghoist means something narrower than OpenFeature does. A disabled flag is off and the value is
false, not "no opinion". `STATIC` says the value did not come from dynamic evaluation, which is
true, and carries no instruction to substitute anything.

Only the OFREP response changes. `evaluate()` still returns `DISABLED`, and the admin API is
untouched, so nothing loses the distinction internally.
