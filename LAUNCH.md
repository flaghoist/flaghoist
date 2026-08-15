# Launch checklist

The path from "the code is done" to "Flaghoist is live and getting used." Work top to bottom —
Phase 0 is a hard gate. Items marked **(you)** can only be done by the founder (accounts,
purchases, decisions); the rest are code/CI/deploy.

Repo state at the time of writing: all 8 build checkpoints complete and committed; ~150 tests
green; OSS hygiene in place (LICENSE, NOTICE, SECURITY.md, CONTRIBUTING, CODE_OF_CONDUCT,
threat-model, CI, release workflow, Dependabot, FUNDING.yml). **Nothing is pushed to a remote and
no packages are published yet.**

---

## Phase 0 — Legal (blocker; do not skip)

- [ ] **(you)** Check your employment / IP agreement for any claim over side projects or derived
      work. Ideally get written acknowledgment that this OSS project is yours.
- [ ] **(you)** Confirm the clean-room discipline held: all Flaghoist code was written fresh, no
      copying from the employer repo. (It was — the OSS design diverges substantially — but the
      go/no-go on publishing is yours.)

> Everything below assumes Phase 0 is cleared.

---

## Phase 1 — Names & accounts (you)

Decision made: use a **GitHub organization**, not a personal repo — the whole codebase already
points at the `flaghoist` org (repo URL, `@flaghoist` npm scope, flaghoist.dev). See the rationale
in chat history.

- [x] **(you)** Create the GitHub org **`flaghoist`** (you are sole owner).
- [x] **(you)** Create the npm org **`flaghoist`** so `@flaghoist/*` can publish — **and** publish a
      `flaghoist@0.0.1` placeholder to reserve the unscoped CLI name. Both halves of the namespace
      are now held.
- [x] **(you)** Register **flaghoist.dev**, and move its nameservers to Cloudflare. A coming-soon
      page is deployed there via Cloudflare Pages (direct upload, project `flaghoist-coming-soon`);
      swap the custom domain to the real `apps/web` project at launch.
- [x] **(you)** Create a **Cloudflare** account (Pages for the sites + a demo Worker).
- [ ] **(you)** Register **.io** defensively (optional).
- [ ] **(you)** Grab social handles: **X / Bluesky** (`@flaghoist` or nearest).
- [ ] **(you)** Enable **GitHub Discussions** on the repo — one checkbox (Settings → Features),
      zero upkeep. This + Issues is the whole support surface for launch.
- [ ] _(defer)_ **Discord** — hold until people are actually asking for a chat room. An empty,
      unattended server reads worse than none. Low time commitment when it happens; announcements
      are drafted for you (see Phase 5).
- [ ] **(you)** Enable **GitHub Sponsors** (the repo already ships `.github/FUNDING.yml`).

---

## Phase 2 — Ship the code

- [x] Create repo **`flaghoist/flaghoist`** and push `main`. Created **private** deliberately, so CI
      could run for the first time and the tracker could be seeded before anyone sees it.
- [x] Confirm **CI is green** on the pushed repo — green on the first run.
- [x] Clear the **Dependabot backlog** it opened on push: 17 merged (each verified locally through
      install → format:check → typecheck → build → check:packages → test, not just trusted from the
      badge), 1 rejected. TypeScript 7 is pinned out in `.github/dependabot.yml` — the Go compiler
      rewrite breaks `.d.ts` generation in core, provider-node and provider-web.
- [x] Seed the tracker: 3 new labels, **7 `good first issue`s** (#19–#25), plus #26 and the tracked
      maintainer TODOs #27–#33.
- [ ] **Flip the repo to public.** Everything above is deliberately done first.
- [ ] Turn on **branch protection** for `main` (require CI + review) — do this _after_ the flip, and
      after any remaining Dependabot merges, or it blocks them.
- [ ] **(you)** Enable **GitHub Discussions** (Settings → Features) once public.
- [ ] Add the **`NPM_TOKEN`** secret for the release workflow (`.github/workflows/release.yml`,
      Changesets → npm publish with provenance).
- [ ] Cut **v0.1.0**: `pnpm changeset` → `pnpm version-packages` → merge → release workflow
      publishes `@flaghoist/*` to npm.
- [ ] Smoke-test a published install in a clean dir:
      `npm create flaghoist@latest smoke` → `npx flaghoist deploy`.

---

## Phase 3 — Deploy the public surfaces

- [ ] **flaghoist.dev** — deploy `apps/web` (Astro) to Cloudflare Pages.
- [ ] **docs.flaghoist.dev** — deploy `apps/docs` (Starlight) to Cloudflare Pages.
- [ ] **demo.flaghoist.dev** — deploy a seeded, **read-only** Flaghoist Worker + dashboard so
      people can click around without deploying anything. (Use a locked-down admin token; seed a
      few flags including one with a targeting rule.)
- [ ] Add **Plausible** (or similar privacy-friendly analytics) to the two sites.

---

## Phase 4 — Pre-launch polish (engineering)

- [ ] **README demo GIF** — record `flaghoist deploy` → create a flag → toggle it in the dashboard →
      app flips. This is the single highest-leverage asset for the launch.
- [ ] **Embed the dashboard into the deploy template** so `flaghoist deploy` / `eject` ship the
      admin UI at `/admin` out of the box. The server already supports `config.dashboard`; what's
      missing is wiring the built dashboard HTML into the generated Worker. (Deferred from CP7.)
- [x] **Publish a `create-flaghoist` package** so `npm create flaghoist` works — built, tested, and
      wired into the README, docs, and landing page. Ships with v0.1.0. ([#27](https://github.com/flaghoist/flaghoist/issues/27))
- [ ] **Convert the tracked TODOs to GitHub issues** (once the repo exists) — see the list below.
- [ ] **Seed `good first issue` labels** — adapters and language guides are ideal (see below).
- [ ] Decide whether the **Miniflare real-KV test** (#9) is pre- or post-launch (recommended:
      post — the adapter is well-covered by the conformance suite already).

---

## Phase 5 — Distribution & announcements

Ordered by leverage. The OpenFeature listing is the highest-value channel for this product.
**All copy below is drafted for you** — Show HN title + body, Product Hunt tagline + description,
the r/selfhosted post, the OpenFeature PR description, and the build-in-public thread. Your job is
to hit publish and be around to reply; the writing is handled.

- [ ] **OpenFeature ecosystem PR** — get Flaghoist listed on the openfeature.dev ecosystem page
      (PR to their repo). Then announce in the **OpenFeature CNCF Slack**. This reaches the exact
      audience already using OpenFeature providers.
- [ ] **Show HN** — "Flaghoist – open-source, OpenFeature-native feature flags you self-host for $0".
- [ ] **Product Hunt** launch.
- [ ] **r/selfhosted** post + PR to **awesome-selfhosted**.
- [ ] **dev.to / X build-in-public** thread walking the architecture + the OFREP bet.

**Launch-day order:** README + GIF polished → Show HN (morning, US) → Product Hunt → r/selfhosted +
awesome-selfhosted PR → build-in-public thread. Be around to answer for the first few hours.

---

## Phase 6 — After launch

- [ ] Track **GitHub stars, npm downloads, Discord members**.
- [ ] Stand up a **public roadmap** (GitHub Projects).
- [ ] Triage issues; keep `main` releasable; ship small, flagged changes.
- [ ] Business scaffolding (non-blocking): keep Apache-2.0 doors open for a future managed
      "Flaghoist Cloud" control plane, enterprise features, and support contracts. Trademark the
      wordmark once there's traction; until then the README brand-use note stands.

---

## Tracked TODOs → GitHub issues

All filed on the repo. Kept here as a map so the launch plan and the tracker don't drift.

**Maintainer TODOs**

- [x] [#27](https://github.com/flaghoist/flaghoist/issues/27) — `create-flaghoist`. **Done.** The
      package exists, the CLI exposes its config helpers so the two cannot drift, and all three
      docs now lead with `npm create flaghoist@latest`. Releases with v0.1.0.
- [ ] [#28](https://github.com/flaghoist/flaghoist/issues/28) — `@flaghoist/mcp`, the MCP server.
      Fast-follow a few weeks after launch, as its own moment. Needs `@flaghoist/admin-client`
      extracted first (the CLI's client is bin-only; the dashboard has a second copy).
- [ ] [#29](https://github.com/flaghoist/flaghoist/issues/29) — dashboard API: surface the server's
      `.error` message instead of raw response text.
- [ ] [#30](https://github.com/flaghoist/flaghoist/issues/30) — dashboard API: normalize every
      failure to `ApiError`.
- [ ] [#31](https://github.com/flaghoist/flaghoist/issues/31) — dashboard: return to the token gate
      on a mid-session 401.
- [ ] [#32](https://github.com/flaghoist/flaghoist/issues/32) — flags: optimistic concurrency
      (ETag/version) and pagination for the admin API.
- [ ] [#33](https://github.com/flaghoist/flaghoist/issues/33) — test `adapter-cloudflare-kv` against
      a real Miniflare KV binding. Lowest priority; the conformance suite already covers the contract.

**Seeded for contributors** — the on-ramp that makes the tracker look inhabited on day one, and the
only real fix for a bus factor of one.

- [#19](https://github.com/flaghoist/flaghoist/issues/19) DynamoDB ·
  [#20](https://github.com/flaghoist/flaghoist/issues/20) SQLite ·
  [#21](https://github.com/flaghoist/flaghoist/issues/21) Deno KV ·
  [#22](https://github.com/flaghoist/flaghoist/issues/22) MongoDB — storage adapters, each ~70 lines
  and validated by the existing conformance suite.
- [#23](https://github.com/flaghoist/flaghoist/issues/23) Go ·
  [#24](https://github.com/flaghoist/flaghoist/issues/24) Python — OFREP language guides.
- [#25](https://github.com/flaghoist/flaghoist/issues/25) — a React example app.
- [#26](https://github.com/flaghoist/flaghoist/issues/26) — auth recipes per identity provider.
