# Getting Flaghoist listed on openfeature.dev

The highest-conversion distribution channel available to this project. Everyone reading the
OpenFeature ecosystem page has already decided they want OpenFeature-compatible flagging — they are
only choosing what to point it at. Unlike a launch-day spike, the listing keeps working for years.

Verified against `open-feature/openfeature.dev@main` on 2026-07-26. Re-check the schema before
filing, in case upstream has moved.

---

## Which category Flaghoist belongs in

The site keeps separate datasets for Hooks, Providers, SDKs, Integrations, and **OFREP APIs**.
Flaghoist is an **OFREP API**: a server that implements the Remote Evaluation Protocol, which
existing OpenFeature providers can be pointed at.

The category is small — at time of writing it holds ConfigCat, DevCycle, flagd, FFlags, Flipswitch,
Flipt, and GO Feature Flag.

**Flaghoist does not need its own provider listing.** The generic `ofrep` provider already in their
`providers/` dataset works against any conformant server, including ours. That is worth stating in
the PR body — it is the point of implementing the protocol rather than shipping SDKs.

---

## The three files the PR touches

### 1. `static/img/flaghoist-no-fill.svg` (new)

Their logos are monochrome and carry **no fill attributes**, so the mark inherits `currentColor`
and works in both themes. Copy `brand/icon-mono.svg` from this repo, which was built for exactly
this constraint (the halyard is a rounded rect rather than a stroked line, so nothing depends on
stroke colour either):

```svg
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="9" r="3" />
  <rect x="14.25" y="9" width="3.5" height="48" rx="1.75" />
  <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" />
</svg>
```

### 2. `src/datasets/ofrep-api/flaghoist.ts` (new)

The shape is defined by the `OFREP_API` type in `src/datasets/ofrep-api/index.ts`:

```ts
import FlaghoistSvg from '@site/static/img/flaghoist-no-fill.svg'
import { OFREP_API } from '.'

export const Flaghoist: OFREP_API = {
  name: 'Flaghoist',
  logo: FlaghoistSvg,
  description:
    'A self-hosted, OpenFeature-native flag service that runs on serverless and edge runtimes with pluggable storage.',
  href: 'https://docs.flaghoist.dev/api-reference/',
  vendorOfficial: true,
}
```

Notes:

- `description` is optional; omitting it produces `The official Flaghoist OFREP API`. The custom
  string above is more useful and stays factual — no superlatives, this audience dislikes them.
- `vendorOfficial: true` is correct: we maintain both the server and the listing.
- `href` should point at the page documenting the OFREP endpoints, not the homepage. Compare Flipt,
  which links straight to its OpenFeature integration docs.

### 3. `src/datasets/ofrep-api/index.ts` (edit)

Two one-line changes — an import, and an entry in the array. The array is roughly alphabetical:

```ts
import { Flaghoist } from './flaghoist'

export const ECOSYSTEM_OFREP_APIS: OFREPElement[] = [
  ConfigCat,
  DevCycle,
  Flagd,
  Flaghoist,
  FFlags,
  Flipswitch,
  Flipt,
  Goff,
]
```

---

## Draft PR description

> **Title:** `feat: add Flaghoist to the OFREP API ecosystem`
>
> ### What
>
> Adds [Flaghoist](https://github.com/flaghoist/flaghoist) to the OFREP API section of the ecosystem
> page.
>
> ### About Flaghoist
>
> Flaghoist is an open-source (Apache-2.0), self-hosted feature-flag service. It runs as a single
> Hono app on Cloudflare Workers, Node, Bun, or Deno, and stores flags through a four-method storage
> adapter, so it can sit on Workers KV, Redis, Postgres, or a database the user brings themselves.
> A single deploy serves the OFREP read path, an admin API, and a management dashboard.
>
> It implements the Remote Evaluation Protocol at `POST /ofrep/v1/evaluate/flags` and
> `POST /ofrep/v1/evaluate/flags/{key}`, with evaluation context carried on the request, so
> percentage rollouts and targeting rules evaluate server-side.
>
> ### Why an OFREP API entry and not a provider
>
> Flaghoist deliberately ships no per-language SDKs. Because the server is OFREP-conformant, the
> existing OpenFeature OFREP providers work against it unmodified — which is exactly the outcome the
> protocol is for. No new provider listing is needed.
>
> ### Changes
>
> - `static/img/flaghoist-no-fill.svg` — monochrome mark, no fill attributes
> - `src/datasets/ofrep-api/flaghoist.ts` — the entry
> - `src/datasets/ofrep-api/index.ts` — import and register it
>
> Verified locally with `yarn start`; the entry renders and filters correctly on `/ecosystem`.

---

## Filing checklist

Their `CONTRIBUTING.md` is specific about process. In order:

- [ ] **Prerequisite:** the repo is public and `docs.flaghoist.dev` is live — maintainers will click
      the `href`, and a 404 is a bad first impression with this community.
- [ ] Fork `open-feature/openfeature.dev`, clone, and add your fork as a remote.
- [ ] `yarn && yarn submodules`, then `yarn start` to confirm the site builds before you change it.
- [ ] Make the three changes above.
- [ ] Confirm the entry renders at `/ecosystem` and survives the category filter.
- [ ] Branch as `feat/NAME_OF_FEATURE`, e.g. `feat/add-flaghoist-ofrep-api`.
- [ ] **Commit with `git commit --signoff`.** DCO sign-off is required; a PR without it will be
      blocked by CI.
- [ ] Open the PR against `main`. Keep it to this one concern — they explicitly ask for small,
      focused PRs.
- [ ] Follow up in the [CNCF OpenFeature Slack](https://cloud-native.slack.com/archives/C0344AANLA1)
      once merged, which reaches the same audience plus the maintainers.

## One thing worth noticing

Their `CONTRIBUTING.md` documents how to add Hooks, Providers, and SDKs — but **not OFREP APIs**.
The steps above were derived from the code. Offering a follow-up PR that documents the OFREP API
path is a cheap, genuinely useful contribution, and a good way to be more than a drive-by listing.
Keep it as a separate PR so the listing itself stays focused.

---

## Could Flaghoist list in more than one category?

Vendors _can_ appear more than once — Flipt, flagd, ConfigCat and GO Feature Flag are each in both
`providers/` and `ofrep-api/`. So the question is only whether we honestly qualify. Category by
category:

| Category               | Verdict             | Why                                                                     |
| ---------------------- | ------------------- | ----------------------------------------------------------------------- |
| **OFREP API**          | **Yes — file it**   | We implement the protocol. Small, curated, high-intent list.            |
| **Providers**          | Not yet — see below | Ours are subclasses of the already-listed generic OFREP provider.       |
| **Integrations**       | Not yet — see below | Category is tooling _around_ OpenFeature, not flag backends.            |
| **Hooks**              | No                  | We ship no OpenFeature hook.                                            |
| **SDKs**               | No                  | That list is OpenFeature's own SDKs.                                    |
| **Commercial support** | No                  | We have no commercial offering. Revisit if support contracts ever ship. |

Note the OFREP entry already sets a `vendor` field (see `ofrep-api/index.ts`), so Flaghoist is
listed _as a vendor_ either way — the question is how many surfaces it appears on.

### Providers — the door is open, but there's a real price

Every dual-listed vendor earned it the same way: their provider entries point at packages inside
OpenFeature's own contrib monorepos (`js-sdk-contrib`, `go-sdk-contrib`, …), and those providers
speak the vendor's **native** API, which is genuinely distinct from OFREP.

Ours are not that. `@flaghoist/provider-web` is `extends OFREPWebProvider` and
`@flaghoist/provider-node` is `extends OFREPProvider` — thin convenience wrappers around the
generic OFREP provider that is _already listed_ at `providers/ofrep.ts`. Submitting them as a
provider listing invites the fair response: "your users can just use the OFREP provider."

The cost of being absent is real, though: `providers/` is the long, browsable list that feeds the
landing page, and it is where LaunchDarkly, Flagsmith, Unleash, Flipt and PostHog all appear. Being
missing from it means being invisible in the comparison people actually scroll.

**The legitimate path** is to contribute an actual `flaghoist` provider to `js-sdk-contrib` and
list that. Only worth doing if it earns its existence over plain OFREP — e.g. definition caching,
local evaluation, or streaming updates. Treat it as a post-launch decision, not a launch blocker.

### Integrations — a genuine future fit

Only two entries today (Dropwizard, FlagLint), and FlagLint's description makes the category's shape
clear: _"Open-source CLI that audits LaunchDarkly Node.js SDK usage and generates safe OpenFeature
migration plans."_ Tooling around OpenFeature, not a flag backend. Flaghoist itself does not fit.

A **Flaghoist MCP server** — letting coding agents create and toggle flags — plausibly would, and
the category is nearly empty, so it would be prominent. Worth revisiting if that gets built.
