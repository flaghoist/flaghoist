---
'@flaghoist/server': patch
---

The weak-secret warning now fires synchronously. It previously hashed the secret with
`crypto.subtle.digest` and logged from the resulting promise, so the warning fired on an
unpredictable later tick and could be lost if the process exited first. The dedup key does not need
to be cryptographic, so a plain synchronous hash makes the warning deterministic (and fixed a flaky
test that depended on that timing). No behaviour change beyond when the line is logged.
