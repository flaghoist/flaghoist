---
title: How it fits together
description: The Flaghoist architecture — service, storage, providers, and evaluation.
---

Flaghoist is a small set of composable pieces. Understanding how they connect makes the rest of
the docs obvious.

## The two halves

**The flag service** is deployed once for your team and lives in your infrastructure. It is a
[Hono](https://hono.dev) app, so the same code runs on Cloudflare Workers, Node, Bun, Deno, and
serverless platforms. It exposes:

- the **OFREP read path** (`POST /ofrep/v1/evaluate/flags`) for apps to evaluate flags,
- the **admin API** (`GET/PUT/DELETE /api/v1/flags`) for managing them,
- the **dashboard** at `/admin`.

**Your apps** consume flags through OpenFeature. A provider fetches evaluated booleans from the
service; your code calls `getBooleanValue('flag', false)` and never depends on Flaghoist directly.

## Evaluation

Each flag is evaluated as an ordered cascade — the same logic on every runtime and language,
because it happens server-side in `@flaghoist/core`:

1. If the flag is **disabled**, serve off.
2. Walk **targeting rules** top to bottom; the first whose conditions all match decides the result
   (optionally gated by a per-rule percentage).
3. If no rule matches, fall through to the flag's **default rollout** percentage.

Percentage rollouts are **sticky**: `sha256(targetingKey + ":" + flagKey) % 100 < percentage`, so a
given user always gets the same answer for the same flag, with no assignment state stored anywhere.

## Storage

Storage is pluggable behind a four-method interface (`get` / `put` / `delete` / `list`). Cloudflare
KV is the default; Redis and Postgres ship too; anything else is a small adapter you write. See
[storage adapters](/storage-adapters/).

The read path caches flag definitions in-isolate, so a burst of evaluations does not hammer
storage — at most one `list()` per cache window.

## No vendor lock-in

Because every call site is standard OpenFeature, moving to (or from) LaunchDarkly, Datadog, or any
OFREP-compatible backend is a one-line provider swap with zero changes to your application code.
