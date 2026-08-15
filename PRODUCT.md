# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Four confirmed audiences. The user declined to name a single primary — all four are real and are
served by the same surface.

- **Platform and infrastructure engineers on edge or serverless stacks.** Already running Cloudflare
  Workers or similar. Want flags inside their own infrastructure and compliance boundary. Evaluate
  on protocol conformance, storage control, and operational cost.
- **Teams leaving per-seat flag pricing.** Have flags today and resent the bill. Evaluate on feature
  parity and migration effort — the audience most exposed to the capabilities Flaghoist does not
  have yet.
- **Indie hackers and solo developers self-hosting.** Want zero standing cost and full control, and
  tolerate pre-alpha maturity.
- **Existing OpenFeature adopters choosing a backend.** Have already committed to the standard and
  are only picking what to point it at. The warmest audience, reached through the openfeature.dev
  ecosystem listing.

**Tiebreak when two conflict** (inherited from earlier positioning decisions, not a fresh answer —
override freely): lead with the edge/serverless wedge, because it is the only claim a neighbouring
product cannot copy. Treat OpenFeature adopters as the highest-intent channel.

## Product Purpose

Flaghoist is an open-source feature-flag service teams deploy on their own infrastructure. It gives
them the flag management they would otherwise rent — toggles, percentage rollouts, targeting rules,
an admin UI, an audit trail — without a vendor, a subscription, or their data leaving their account.

Near-term success is adoption by self-hosters, with GitHub stars as the leading signal the project
is being found at all. Longer-term success is being the default answer for feature flags on edge and
serverless runtimes.

## Positioning

Every comparable self-hosted option requires a running server and a database. Flaghoist requires
neither: it is a single Hono app that runs on Cloudflare Workers, Node, Bun or Deno, stores flags
through a four-method adapter over whatever database the adopter already operates, and scales to
zero — so idle cost is genuinely nothing.

Its read path implements OFREP (the OpenFeature Remote Evaluation Protocol), which means every
language with an OpenFeature provider works on day one without Flaghoist shipping a single
per-language SDK. That is the mechanism a competitor cannot truthfully copy without also
implementing the standard.

## Operating Context

- A team deploys one Flaghoist instance per environment, into their own cloud account. One deploy
  serves the OFREP read API, the versioned admin API, and the management dashboard at `/admin` —
  there is no second service and no vendor console.
- Applications never import Flaghoist. They talk to OpenFeature, and a provider points at the
  adopter's own server URL. Swapping vendors is a one-line provider change.
- Flags are managed either from the dashboard (non-engineers included) or the `flaghoist` CLI, with
  no deploy required to change one.
- Evaluation happens server-side against a request-carried evaluation context, so targeting rules and
  sticky rollouts resolve without shipping rule logic to clients.
- Two deployment models ship deliberately: a zero-config `flaghoist.toml` appliance, and
  `flaghoist eject`, which converts it into a TypeScript project the adopter owns outright.

## Capabilities and Constraints

**Ships today:** boolean flags; sticky SHA-256 percentage rollouts that do not reshuffle users
between deploys; ordered targeting rules (first match wins, AND within a rule); OFREP read path;
versioned `/api/v1` admin API with a served OpenAPI 3.1 document; storage adapters for Cloudflare KV,
Redis, Postgres and memory, all validated by a shared conformance suite; pluggable auth
(bearer token, API key, OIDC); a Vue admin dashboard with a visual rule builder; a CLI for scaffold,
deploy, eject and flag management; `create-flaghoist` for `npm create flaghoist`.

**Does not exist yet, and must never be implied:** multivariate flags (boolean only), experiments or
A/B analysis, named reusable segments, scheduled rules, regex operators, optimistic concurrency on
concurrent admin edits, and pagination on the flag list.

**Maturity constraints:** pre-alpha; APIs may change without notice until 0.1.0; one maintainer;
Apache-2.0. Production use is not currently recommended, and the project says so on its own surfaces.

**Deliberately undecided:** whether a commercial offering ever exists. Apache-2.0 keeps the door open
to a future managed control plane, enterprise features, or support contracts, but none exists today
and no surface may imply one.

## Brand Commitments

Binding, and already recorded in `brand/README.md`:

- **Mark:** a swallowtail signal flag on a halyard — the naval flag hoist the project is named for.
  Geometric, flat, confident, lightly nautical, never kitschy. Never recolour the flag away from
  signal orange; never add gradients, bevels or drop shadows to the mark.
- **Palette:** Ink `#0B1E3A`, Ink 2 `#17335C`, Signal orange `#FF4A1F`, Sail `#F7F4EC`, Slate
  `#8B9AB0`, flag-on green `#1D9E75`, flag-off red `#E24B4A`.
- **Voice:** "Own your flags." Confident, infrastructure-minded, developer-first. Compare honestly,
  including where Flaghoist loses. Do not oversell — a KV kill switch is "within a minute on next
  load," never "instant." Never punch down at the tools Flaghoist is an alternative to.
- **Name and namespace:** GitHub org `flaghoist`, npm scope `@flaghoist` plus the unscoped
  `flaghoist` package, and the domain `flaghoist.dev`.

**Open conflict to resolve:** `brand/README.md` specifies Inter 600 for the wordmark, but the
shipped landing page sets it in Fraunces. One of the two is wrong. Not resolved here — this record
only notes that the brand kit is the older authority.

## Evidence on Hand

**Real, and usable:** a complete brand kit (`brand/`); a working dashboard, CLI, four storage
adapters and roughly 150 passing tests; a served OpenAPI 3.1 document; a drafted openfeature.dev
ecosystem listing (`docs/openfeature-listing.md`); a launch plan (`LAUNCH.md`).

**Absent — must never be fabricated:** there are no users, customers, testimonials, case studies,
logos, press mentions, adoption numbers, download counts, benchmarks, or uptime figures. Nothing has
been published to npm beyond a `flaghoist@0.0.1` name placeholder, the repository is still private,
and no demo instance is deployed. Any social proof on any surface would be invented.

## Product Principles

1. **The adopter's exit is always open.** Their data stays in their storage, the API is an open
   standard, the licence is permissive, and `eject` hands them the code. Nothing may be designed that
   makes leaving harder.
2. **Compare honestly, including the losses.** Stating what Flaghoist cannot do is a credibility
   instrument with this audience, not a liability to be minimised.
3. **Standards instead of SDKs.** Conformance to OFREP is the leverage; per-language libraries are
   the thing deliberately not built.
4. **Zero standing cost is a feature, not a pricing tier.** Scale-to-zero and BYO storage are
   architectural commitments, and claims about cost must stay literally true.
5. **Precision over enthusiasm.** Specific, checkable claims beat superlatives, and a maintainer of
   one is stated plainly rather than obscured.

## Accessibility & Inclusion

**WCAG 2.1 AA** is the committed bar for all surfaces. It constrains contrast (notably signal orange
on sail, and muted slate text on dark bands), visible focus states, full keyboard paths through the
dashboard's toggles and rollout sliders, and honouring `prefers-reduced-motion`.
