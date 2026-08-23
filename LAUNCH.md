# Launch checklist

The path from "the code is done" to "Flaghoist is live and getting used." Work top to bottom —
Phase 0 is a hard gate. Items marked **(you)** can only be done by the founder (accounts,
purchases, decisions); the rest are code/CI/deploy.

Repo state (last synced 2026-08-23): all 8 build checkpoints complete; 206 tests green across 11
published packages (28 test files); OSS hygiene in place (LICENSE, NOTICE, SECURITY.md,
CONTRIBUTING, CODE_OF_CONDUCT, threat-model, CI, release workflow, Dependabot, FUNDING.yml). `main`
is pushed and current on `flaghoist/flaghoist`, which is **public as of 2026-08-23**.

**Shipped to npm.** All 11 packages are published and public: `flaghoist` and `create-flaghoist`
unscoped, plus nine under `@flaghoist/*`. The CLI is on **0.1.2**, everything else on 0.1.1. The
`flaghoist@0.0.1` placeholder is superseded. The quickstart has been verified end to end from a
clean directory against a real Cloudflare account: `npm create flaghoist@latest` then
`npx flaghoist deploy` deploys a working Worker with the dashboard at `/admin`.

Provenance is back on now the repo is public. The release workflow still cannot open its own
Version Packages PR, because Actions PR creation is disabled on the repo, so each release needs that
PR opened by hand with `gh pr create --head changeset-release/main`. See Phase 2.

`flaghoist.dev` serves the real landing page and `docs.flaghoist.dev` serves the docs, both as
direct-upload Pages projects (`get-flaghoist` and `flaghoist-docs`). Neither is connected to the
repository, so neither redeploys on push; doc changes need `wrangler pages deploy` until that is
wired up.

All seven claimable languages are verified against a live server, recorded in
`docs/language-verification.md`. PHP was removed from the site because no OFREP provider exists for
it.

The public surfaces have all had their design pass: landing page, admin dashboard, brand kit, and
docs site. The README demo GIF is recorded and live at `brand/demo.gif`.

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
      page is deployed there via Cloudflare Pages (direct upload, project `get-flaghoist`);
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
- [x] **Flip the repo to public. Done (2026-08-23).** Everything above was deliberately done first.
      Publishing had already happened privately, without provenance; the flip restored it and fixed
      the three GitHub links on the landing page.
- [x] **Restore npm provenance. Done (2026-08-23).** `NPM_CONFIG_PROVENANCE` is uncommented in
      `.github/workflows/release.yml` and takes effect on the next release.
- [ ] Turn on **branch protection** for `main` (require CI + review). **Not currently possible**:
      GitHub requires a public repo or a paid plan for protection rules, and this one is private on
      the free tier. Do it at the public flip, and not before the Version Packages PR merges, or it
      blocks Changesets from merging its own PR.
- [x] Add the **`NPM_TOKEN`** secret for the release workflow. **Done (2026-08-21).** The job also
      needs the same secret as `NODE_AUTH_TOKEN`, because `setup-node`'s `registry-url` writes an
      `.npmrc` referencing that name; without it every publish 404s.
- [x] **Cut the first release. Done (2026-08-21).** All 11 packages published together at 0.1.0,
      then 0.1.1 (READMEs and npm metadata) and 0.1.2 (the two deploy fixes below). They release as
      a set: `server` needs `core`, `vue` needs `provider-web`, `create-flaghoist` needs
      `flaghoist`, and generated projects pin `server` plus one adapter, so a missing package is an
      install failure. **Each release needs the Version Packages PR opened by hand** with
      `gh pr create --head changeset-release/main`; the workflow generates the branch but cannot
      open the PR.
- [x] **Smoke-test a published install. Done (2026-08-23).** `npm create flaghoist@latest` then
      `npx flaghoist deploy` in a clean directory, against a real Cloudflare account, deploying a
      live Worker serving `/health` and the dashboard at `/admin`. It found two bugs that a stubbed
      wrangler could not: `deploy` never ran `npm install`, so bundling could not resolve
      `@flaghoist/server`; and the KV namespace was titled `FLAGS`, which is unique per account, so
      every project after the first failed. Both fixed in 0.1.2 and re-verified.

---

## Phase 3 — Deploy the public surfaces

- [x] **flaghoist.dev. Done (2026-08-23).** `apps/web` deployed to the existing `get-flaghoist`
      Pages project, replacing the coming-soon page. Deployed after the docs deliberately: the
      landing page links to four docs pages, and shipping it first would have put a live page with
      dead links in front of launch traffic.
- [x] **docs.flaghoist.dev. Done (2026-08-23).** `apps/docs` deployed to a new `flaghoist-docs`
      Pages project, 11 pages with a Pagefind search index, custom domain attached by hand because
      wrangler has no command for it.
- [ ] **Connect both Pages projects to the repository.** Both are direct upload, so neither
      redeploys on push and a docs fix reaches the site only when someone runs
      `wrangler pages deploy`. Easy to forget, and invisible when forgotten.
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
- [x] **README demo GIF, stage 1 of 3: local. Done (2026-08-21).** `brand/demo.gif` is recorded and
      the `<img>` is uncommented in `README.md`. 15.4s, 1400px, 630KB, 14fps, gifski at q90, against
      a 5MB budget. Four beats, all real: the example app on the legacy checkout, the dashboard at
      `/admin`, one click on the toggle, the app live. Recorded with Playwright against a local
      `wrangler dev` (real workerd, real KV) and the Vue example, so it is re-recordable by anyone
      with no Cloudflare account. The script and the local stack are described in
      `docs/recording-the-demo.md`.
- [ ] **README demo GIF, stage 2: real deploy, your account.** Re-record beat 1 as a true
      `npx flaghoist deploy` to a live `workers.dev` URL. **Blocked until v0.1.0 is on npm**: the
      terminal beat runs `npm create flaghoist@latest` and `npx flaghoist deploy`, and neither
      resolves while the packages are unpublished, so a genuine recording is impossible before
      Phase 2 cuts the release. Decide then whether to show the real `workers.dev` subdomain, which
      leaks the Cloudflare account name, or to crop it.
- [ ] **README demo GIF, stage 3: demo.flaghoist.dev.** Re-record against the seeded demo Worker
      behind the custom domain, so the URL on screen reads `demo.flaghoist.dev` and no account name
      appears at all. Depends on the Phase 3 demo deploy. This is the version that should end up in
      the README for launch; stages 1 and 2 are steps on the way.
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
