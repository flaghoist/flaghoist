---
title: Read flags from your app
description: Flaghoist speaks OFREP, so any language with an OpenFeature provider reads flags with no Flaghoist-specific SDK.
---

Your application never imports Flaghoist. It talks to [OpenFeature](https://openfeature.dev), the
vendor-neutral feature-flag standard, and an OpenFeature provider points at your Flaghoist server.
The wire protocol between them is [OFREP](https://openfeature.dev/specification/appendix-c), the
OpenFeature Remote Evaluation Protocol, which Flaghoist implements on its read path.

That is why there is no `@flaghoist/go` or `flaghoist-python`: those providers already exist, written
and maintained by the OpenFeature community, and reinventing them would be worse than using them. You
install the OpenFeature SDK and its OFREP provider for your language, point it at your server URL, and
attach your read API key.

## Verified languages

Each of these was run against a live Flaghoist server, not inferred from the protocol. The version is
the provider tested; newer versions should work but a pass is a statement about the version listed.

| Language                                        | Provider package                                                 | Tested |
| ----------------------------------------------- | ---------------------------------------------------------------- | ------ |
| [JavaScript / TypeScript](/clients/javascript/) | `@openfeature/ofrep-web-provider`, `@openfeature/ofrep-provider` | in use |
| [Go](/clients/go/)                              | `github.com/open-feature/go-sdk-contrib/providers/ofrep`         | v0.1.7 |
| [Python](/clients/python/)                      | `openfeature-provider-ofrep`                                     | 0.3.0  |
| [Java](/clients/java/)                          | `dev.openfeature.contrib.providers:ofrep`                        | 0.0.2  |
| [.NET](/clients/dotnet/)                        | `OpenFeature.Providers.Ofrep`                                    | 0.1.5  |
| [Ruby](/clients/ruby/)                          | `openfeature-ofrep-provider`                                     | 0.1.2  |
| [Rust](/clients/rust/)                          | `open-feature-ofrep`                                             | 0.1.2  |

PHP has an OpenFeature SDK but no OFREP provider yet, so it is not listed. When one ships, it will
work the same way as the rest.

## Two things every language shares

**Use the read key, never the admin token.** The read path is guarded by the `READ_API_KEY` you set,
sent as the `x-api-key` header. It can only evaluate flags, not change them. The admin token is for
managing flags and must never reach a client.

**A rejected key fails closed.** If the key is wrong or missing, every provider returns the default
you passed to the evaluation, not the real flag value. A flag is never leaked from a server that
refused the request, and your app falls back to its safe default rather than breaking.

## Evaluation context

Targeting rules and percentage rollouts are evaluated against the context you send: a targeting key
that identifies the user, plus any attributes the rules match on.

Everything in that context is supplied by the caller and can be anything they choose. If a flag gates
something that matters, a paywall or an entitlement, do not target it on a client-supplied attribute:
a caller who sends `plan: "pro"` would be served the feature. Derive trustworthy attributes on the
server through [`trustedContext`](/auth/#security-notes) instead.
