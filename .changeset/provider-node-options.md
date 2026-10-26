---
'@flaghoist/provider-node': minor
---

Pass every option of the official OFREP server provider through: `timeoutMs`, `headersFactory`,
`query` and `fetchImplementation`, with the upstream defaults. They apply to the bulk request as
well as to `bulk: false`. The options now have the same shape as `@flaghoist/provider-web`.
