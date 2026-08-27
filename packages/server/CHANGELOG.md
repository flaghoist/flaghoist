# @flaghoist/server

## 0.3.0

### Minor Changes

- a996987: Optimistic concurrency on the admin API. `GET /api/v1/flags/:key` now returns an `ETag` (derived from
  the flag's `updatedAt`, which is kept strictly increasing), and `PUT /api/v1/flags/:key` honours
  `If-Match`: a write whose token no longer matches the stored flag is refused with `412 Precondition
  Failed` instead of silently overwriting another edit. `If-Match: *` requires the flag to still exist.
  A `PUT` with no `If-Match` stays unconditional (last write wins), so the CLI and existing clients are
  unaffected. The bundled dashboard sends `If-Match` on every edit and, on a conflict, reloads and asks
  the operator to reapply.

## 0.2.3

### Patch Changes

- d6e546c: Set baseline security headers on every response. The admin dashboard is now served with
  `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`, so it can no longer be
  embedded in a frame and clickjacked, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer` and a restrictive `Permissions-Policy`. These are additive and do not change the API
  behaviour; the only visible effect is that the dashboard cannot be framed, which an admin tool should
  not be.

## 0.2.2

### Patch Changes

- 6cfcd8d: Purge a legacy admin token left in `localStorage` by an older dashboard build.
  
  The token moved from `localStorage` to `sessionStorage` so it no longer persists on disk, but a
  dashboard built before that change may have already written one to `localStorage`, where the new code
  never touched it, so it lingered indefinitely, which is exactly what the move was meant to prevent.
  The dashboard now removes it once on load. New sessions have never used `localStorage`, so they are
  unaffected.

## 0.2.1

### Patch Changes

- 79243ae: Drop `Access-Control-Allow-Credentials` from CORS, and pin the opaque error response.
  
  Flaghoist authenticates with headers (`x-api-key`, `Authorization`), which a browser does not attach
  to a cross-origin request on its own, so `Access-Control-Allow-Credentials: true` bought nothing and
  was a latent hole: the day a cookie or session flow is added, an allowlisted origin could ride an
  ambient credential. An allowlisted origin still receives `Access-Control-Allow-Origin`, so
  header-authenticated cross-origin reads are unaffected. Add the credentials header back only
  alongside a deliberate credentialed flow.
  
  Also adds a test pinning the server's opaque `{ error: 'Internal server error' }` response, so a
  future change that returned an internal error message to the client would fail rather than leak.

## 0.2.0

### Minor Changes

- 4d0093e: Let a deployment stop serving the OpenAPI document.
  
  `/api/v1/openapi.json` is unauthenticated and describes every route and auth scheme, so it hands a
  scanner the API surface. Set `exposeOpenApi: false` in the config to have it return 404. It stays on
  by default, so tooling that reads the document keeps working.
  
  The admin dashboard at `/admin` was already opt-out, via `dashboard = false` in `flaghoist.toml`.
  This is obscurity rather than a security control, since the routes are open source: turn these off if
  you have no use for them, not in place of a strong admin token and rate limiting.
- 57b2c6f: Add opt-in rate limiting.
  
  Flaghoist did not throttle anything, so authentication attempts, the evaluate path, and the
  unauthenticated `/admin` payload could all be hit as fast as the network allowed. A `rateLimit` hook
  in the server config turns limiting on, applied to every route except `/health` and run before
  authentication so credential guessing is throttled too. A denied request returns `429` with a
  `Retry-After` header, and the OFREP read path treats a `429` as an error and returns the caller's
  default, so limiting it fails safe.
  
  The bundled `memoryRateLimit` counts per client IP in memory: genuinely effective on a single Node
  or container process, and per-isolate on Cloudflare Workers, where the platform's own Rate Limiting
  rules are the real answer and this is a backstop. Bring your own limiter (a Redis counter, a
  Cloudflare binding) by passing any object with a `check(key)` method, and override the bucket key
  when you have a trustworthy client identifier.
  
  Off by default: a limiter with the wrong bucket key is worse than none, and only the operator knows
  how their deployment is fronted. Existing configs are unaffected.

### Patch Changes

- cdc0d7b: Three hardening fixes from a security audit.
  
  The admin dashboard now keeps the session token in `sessionStorage` rather than `localStorage`, so
  the token dies with the browser tab instead of sitting on disk. It is full admin authority with no
  expiry, and `localStorage` is readable by any script on the origin, so a smaller window is the safer
  default. The sign-in URL field already defaults to the current origin, so nothing is lost by not
  persisting it.
  
  A flag description is now bounded to 2048 characters. It was unbounded within the 64KB request body
  limit, so an authenticated writer could bloat every `list()` and every dashboard load, since the
  list returns full flag bodies with no pagination. `parseFlag` rejects a flag over the cap and the
  admin write path returns a specific error.
  
  `apiKey` and `bearerToken` warn once, to the server log, when the shared secret is under 16
  characters. Flaghoist does not rate limit authentication, so a short token is guessable; the warning
  is guidance rather than a wall, since rejecting a short secret outright could lock an operator out of
  a running service. The secret is never retained: the dedupe key is a short hash of it.
- Updated dependencies [cdc0d7b]
  - @flaghoist/core@0.1.2

## 0.1.4

### Patch Changes

- 1c6feb4: Stop a newly created flag disappearing behind the active dashboard filter.
  
  Creating a live flag while the **paused** chip was selected saved it, added it to the list, and then
  filtered it straight back out of view with no message. Nothing distinguished that from the save
  having failed silently, and the natural next move is to create the flag again.
  
  Creating a flag that the current filter or search would hide now clears them and says so. Editing an
  existing flag leaves the filter alone, since that is a view you chose on purpose.
  
  The filter predicate was also written twice, once for the list and once implicitly for the chips.
  There is now one function feeding both, so they cannot drift apart.
  
  The dashboard ships inside `@flaghoist/server`, which is why this releases there.
  
  Creating a flag is also confirmed now. The list is alphabetical, so a new flag can land below the
  fold and the closing dialog was the only sign anything had happened at all.
  
  The message strip carried `role="alert"` for everything it said. An alert is for an urgent
  interruption, so a confirmation announcing itself that way is wrong for anyone using a screen
  reader. Errors keep `role="alert"`, confirmations use `role="status"`, and the two are now
  distinguishable by colour as well.
  
  The list is ordered newest first as well. It was alphabetical, so a new flag landed wherever its
  name fell, often far below the fold in a list of any size. Ordering is on `createdAt` rather than
  `updatedAt`, so the last flag you added is the first row and editing one does not move it: sorting
  by last edit would reshuffle rows every time a toggle was flipped. The key breaks ties.
  
  Deleting a flag now asks in the page rather than through `window.confirm`. That call could not be
  relied on: Chrome offers "prevent this page from creating additional dialogs" after a few in a row,
  and once that is ticked every later call returns false with no dialog shown. Delete then did
  nothing at all, silently, which reads as a broken button rather than a refused action. Every delete
  attempted during a testing session was discarded that way, without a single request leaving the
  browser.
  
  The dialog focuses Cancel rather than Delete, so a stray Enter on a destructive prompt does nothing,
  and Escape closes it. Deleting is confirmed afterwards like any other change.

## 0.1.3

### Patch Changes

- e1bc451: Report `STATIC` rather than `DISABLED` on the OFREP wire for a disabled flag, so every language
  agrees on what the flag is worth.
  
  OpenFeature clients read `DISABLED` as "this flag is not participating, use the default you passed
  in". The Go OFREP provider acts on that: it discarded the `value: false` we sent and returned the
  caller's default instead. The JavaScript provider honoured the value. The same flag on the same
  server answered `false` in JavaScript and `true` in Go.
  
  It fails in the worst place. A kill switch is usually written as `BooleanValue(ctx, "feature", true)`,
  on unless we turn it off, so a Go service kept serving a feature after it had been disabled, while
  the dashboard showed it off.
  
  Flaghoist means something narrower than OpenFeature does. A disabled flag is off and the value is
  false, not "no opinion". `STATIC` says the value did not come from dynamic evaluation, which is
  true, and carries no instruction to substitute anything.
  
  Only the OFREP response changes. `evaluate()` still returns `DISABLED`, and the admin API is
  untouched, so nothing loses the distinction internally.

## 0.1.2

### Patch Changes

- 8aff467: Pick up patch updates to the runtime dependencies these packages ship.
  
  `@flaghoist/server` moves to `hono` 4.13.3 and `jose` 6.2.9, `flaghoist` to `smol-toml` 1.8.0, and
  `@flaghoist/provider-web` to `@openfeature/ofrep-web-provider` 0.4.3. The bumps landed on `main`
  already; without a release they sit there and nobody installing from npm gets them.
  
  No behaviour of ours changes. `@flaghoist/vue` and `create-flaghoist` come along because they depend
  on `@flaghoist/provider-web` and `flaghoist` respectively.

## 0.1.1

### Patch Changes

- 642917a: Give every package a README, plus the metadata npm needs to link it back here.

  npm reads `README.md` from the package directory rather than the repo root, so all eleven published
  with an empty page telling people to add one. Each package now has its own, written for someone
  landing on npm cold rather than someone who has already read the root README.

  Also adds `keywords`, `repository` (with `directory`), `homepage` and `bugs`. `flaghoist` had no
  keywords at all, so it did not come up in an npm search for feature flags, and nothing linked any
  package back to the repository or the issue tracker.

  Also drops the unused `version` export from `@flaghoist/core`. It was hardcoded to `'0.0.0'`, so it
  kept saying that after the package published as `0.1.0`. Nothing in the repo imported it, and a
  value that has to be kept in step by hand is worse than no value at all. If a version export earns
  its place later it should be generated at build time, since `createRequire` is not available in the
  Workers and browser runtimes this package targets.

- Updated dependencies [642917a]
  - @flaghoist/core@0.1.1

## 0.1.0

### Minor Changes

- e13bd69: First published release: every package goes out together at 0.1.0.

  The packages are only useful as a set, so releasing a subset would ship broken installs.
  `@flaghoist/server` depends on `@flaghoist/core`, `@flaghoist/vue` depends on
  `@flaghoist/provider-web`, `create-flaghoist` depends on `flaghoist`, and the project the CLI
  generates depends on `@flaghoist/server` plus whichever storage adapter you picked. Any of those
  left unpublished is an install failure for someone following the quickstart.

  `flaghoist --version` now reports the version from `package.json` instead of a hardcoded `0.0.0`,
  so a version in a bug report means something.

  Treat 0.1.0 as an alpha in everything but the version number: it is a real release on `latest` so
  that the documented commands work as written, but the API is not stable and will change.

- c58f8e4: Ship the admin dashboard with `flaghoist deploy` and `flaghoist eject`, so `/admin` works out of the
  box.

  The server has always been able to serve the dashboard, through `config.dashboard`, but the CLI
  never set it. A Worker from a fresh `flaghoist deploy` answered `/admin` with "Dashboard not
  configured" and a 404, one line below where the quickstart told you to open it. The message pointed
  at a setting that could not be reached from the path the docs prescribed: there was no dashboard key
  in `flaghoist.toml` and no flag on the CLI.

  `@flaghoist/server` now exports the prebuilt single-file dashboard as `dashboardHtml` from
  `@flaghoist/server/dashboard`, and the generated Worker imports it. It is a separate entry point, so
  a deployment that does not want the UI never pulls the HTML into its bundle.

  The dashboard is on by default. Set `dashboard = false` in `flaghoist.toml` to generate a Worker
  that serves the read and admin APIs alone. Configs written before this release have no such key and
  keep serving the dashboard, which is the documented behaviour.

### Patch Changes

- Updated dependencies [e13bd69]
  - @flaghoist/core@0.1.0
