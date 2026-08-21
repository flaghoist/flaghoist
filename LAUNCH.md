# Launch checklist

The path from "the code is done" to "Flaghoist is live and getting used." Work top to bottom —
Phase 0 is a hard gate. Items marked **(you)** can only be done by the founder (accounts,
purchases, decisions); the rest are code/CI/deploy.

Repo state (last synced 2026-08-21): all 8 build checkpoints complete; 204 tests green across 12
packages (27 test files); OSS
hygiene in place (LICENSE, NOTICE, SECURITY.md, CONTRIBUTING, CODE_OF_CONDUCT, threat-model, CI,
release workflow, Dependabot, FUNDING.yml). `main` is pushed and current on
`flaghoist/flaghoist`, which is **still private**. On npm only the `flaghoist@0.0.1` placeholder
exists — **no `@flaghoist/*` package is published yet**, and one changeset
(`create-flaghoist` + `flaghoist`, minor) is staged for v0.1.0.

The public surfaces have all had their design pass: landing page, admin dashboard, brand kit, and
docs site. Nothing in the repo blocks the public flip on its own — the README's `demo.gif` embed sits
inside an HTML comment, so the missing file renders nothing rather than a broken image.

---

## Phase 0 — Legal (cleared 2026-08-21)

- [x] **(you)** Check your employment / IP agreement for any claim over side projects or derived
      work. Ideally get written acknowledgment that this OSS project is yours.
- [x] **(you)** Confirm the clean-room discipline held: all Flaghoist code was written fresh, no
      copying from the employer repo. (It was — the OSS design diverges substantially — but the
      go/no-go on publishing is yours.)

> **Phase 0 is cleared as of 2026-08-21.** The gate on everything public is lifted; the public flip
> now waits only on the engineering items in Phase 4.

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

- [x] **Embed the dashboard into the deploy template** so `flaghoist deploy` / `eject` ship the
      admin UI at `/admin` out of the box. **Done (2026-08-21).** `@flaghoist/server` now exports the
      prebuilt single-file dashboard as `dashboardHtml` from the `@flaghoist/server/dashboard`
      subpath, generated at build time from `apps/dashboard/dist/index.html` by
      `packages/server/scripts/embed-dashboard.mjs`, and `packages/cli/src/generate.ts` imports it
      into the generated Worker. A separate entry point, so a deploy that does not want the UI never
      pulls the HTML into its bundle. New `dashboard` key in `flaghoist.toml` (default `true`) turns
      it off. Changeset staged (`@flaghoist/server` + `flaghoist`, minor). Full chain green: 196
      tests, build (15/15), typecheck (22/22), `check:packages` (22/22), `format:check`. The demo GIF is now unblocked.
- [ ] **README demo GIF** — record `flaghoist deploy` → create a flag → toggle it in the dashboard →
      app flips. The single highest-leverage asset for the launch. **Now unblocked**: the dashboard
      embed above shipped, so the four-beat shot list can be recorded against shipped code. Not a blocker on going public: the `<img>` is commented out in `README.md`, so the
      missing file is invisible until it is uncommented.
- [x] **Publish a `create-flaghoist` package** so `npm create flaghoist` works — built, tested, and
      wired into the README, docs, and landing page. Ships with v0.1.0. ([#27](https://github.com/flaghoist/flaghoist/issues/27))
- [x] **Convert the tracked TODOs to GitHub issues** — filed as #27–#33 (see the list below).
- [x] **Seed `good first issue` labels** — 7 filed (#19–#25) plus #26; 3 new labels created.
- [x] **Design pass over every public surface** — landing page rebuilt around the real evaluation
      engine, admin console recomposed (and no longer calling Google for fonts), brand kit
      reconciled with what ships, and the docs site rebranded and overhauled. All committed and
      pushed.
- [x] **Fix the KV namespace placeholder in the quickstart path. Done (2026-08-21).** A fresh
      `wrangler.toml` carried `id = "<your-kv-namespace-id>"` literally, so on the default
      `cloudflare-kv` storage the first command in the README (`npx flaghoist deploy`) failed until
      the user ran `npx wrangler kv namespace create FLAGS` and pasted the id, which nothing told
      them to do. `deploy` now creates the namespace and writes the id back itself, only while the
      placeholder is present, so a pasted id is never overwritten and repeat deploys reuse the
      namespace. Failure and unreadable-output paths stop with the manual command instead of
      continuing into a doomed deploy. `eject` prints the command, and `self-hosting.md` documents
      the behaviour. The README quickstart now works as written, unchanged.
- [ ] **Consider woff2 for the embedded dashboard fonts.** The single-file build inlines three
      `font/woff` faces as base64, which is 229KB of the 332KB bundle. woff2 would cut most of that.
      Not a blocker: 332KB raw is 211KB gzipped, against a 3MB Worker limit.
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
- [x] [#29](https://github.com/flaghoist/flaghoist/issues/29) — dashboard API: surface the server's
      `.error` message instead of raw response text. **Done** in the dashboard recompose.
- [x] [#30](https://github.com/flaghoist/flaghoist/issues/30) — dashboard API: normalize every
      failure to `ApiError`. **Done** in the dashboard recompose.
- [x] [#31](https://github.com/flaghoist/flaghoist/issues/31) — dashboard: return to the token gate
      on a mid-session 401. **Done** in the dashboard recompose.
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
