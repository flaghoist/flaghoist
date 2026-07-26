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

- [ ] **(you)** Create the GitHub org **`flaghoist`** (you are sole owner).
- [ ] **(you)** Create the npm org **`flaghoist`** (free for public packages) so `@flaghoist/*` can
      publish. (Name verified available.)
- [ ] **(you)** Register **flaghoist.dev** (and **.io** defensively).
- [ ] **(you)** Create a **Cloudflare** account (Pages for the sites + a demo Worker).
- [ ] **(you)** Grab social handles: **X / Bluesky** (`@flaghoist` or nearest).
- [ ] **(you)** Enable **GitHub Discussions** on the repo — one checkbox (Settings → Features),
      zero upkeep. This + Issues is the whole support surface for launch.
- [ ] _(defer)_ **Discord** — hold until people are actually asking for a chat room. An empty,
      unattended server reads worse than none. Low time commitment when it happens; announcements
      are drafted for you (see Phase 5).
- [ ] **(you)** Enable **GitHub Sponsors** (the repo already ships `.github/FUNDING.yml`).

---

## Phase 2 — Ship the code

- [ ] Create repo **`flaghoist/flaghoist`** and push `main`.
- [ ] Turn on **branch protection** for `main` (require CI + review).
- [ ] Confirm **CI is green** on the pushed repo (`.github/workflows/ci.yml` already exists).
- [ ] Add the **`NPM_TOKEN`** secret for the release workflow (`.github/workflows/release.yml`,
      Changesets → npm publish with provenance).
- [ ] Cut **v0.1.0**: `pnpm changeset` → `pnpm version-packages` → merge → release workflow
      publishes `@flaghoist/*` to npm.
- [ ] Smoke-test a published install in a clean dir: `npx flaghoist init` → `npx flaghoist deploy`.
      (Note: there is no `create-flaghoist` package, so `npm create flaghoist` does **not** work —
      decide before launch whether to publish one, since `npm create` is what people will try.)

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

Create these as issues once the repo is pushed (drafts are ready in chat / the task list):

**Post-go-live product improvements**

- [ ] **Miniflare real-KV adapter test** — a `@cloudflare/vitest-pool-workers` test for
      `adapter-cloudflare-kv` against a real Miniflare KV binding. (#9)
- [ ] **Dashboard API: surface server error messages** — parse the JSON error body and show
      `.error` instead of the raw response text. (#10)
- [ ] **Dashboard API: normalize failures to `ApiError`** — one error model for network/parse
      failures, not two. (#11)
- [ ] **Dashboard: return to the token gate on a mid-session 401** — treat an expired/revoked
      token as session-over. (#12)
- [ ] **Flags: concurrency + scale** — optimistic concurrency (ETag/version) for concurrent admin
      edits, and pagination for `GET /flags`. (#13)

**`good first issue` candidates**

- [ ] Storage adapters we don't ship yet: **DynamoDB, Deno KV, SQLite, MongoDB** — implement the
      four-method `StorageAdapter` and pass the shared conformance suite.
- [ ] **OFREP language guides** — using Flaghoist from Go / Python / Java / .NET / PHP / Ruby via
      each language's official OpenFeature OFREP provider.
- [ ] A **React example** app (mirrors the Vue example via `@openfeature/react-sdk`).
