# flaghoist

## 0.4.0

### Minor Changes

- c7c4e6e: Add personal access tokens. Members create `fh_pat_` tokens for the CLI, the MCP server and
  scripts, from the Account page or `POST /api/v1/tokens`. A token acts as its owner, so changes are
  attributed to them; it can have a lower role than its owner but never a higher one, and the owner's
  current role caps it on every request, so demoting, disabling or removing someone narrows or stops
  their tokens. Tokens expire after 90 days by default (1 to 3650 days, or never on purpose), are
  stored only as hashes, show when they were last used, and are audited when created, revoked or
  expired.
  
  The CLI adds `flaghoist login` (email and password, hashed locally; saves a token in the user
  config folder, readable only by you), `flaghoist logout` (revokes it), and
  `flaghoist tokens list | create | revoke`. Commands fall back to the saved token when no `--token`
  or `FLAGS_ADMIN_TOKEN` is given.
- 83487f3: Add roles per environment. With environments configured, a member can have a different role in
  some of them, such as editor in staging for a viewer, or read-only in production for an editor.
  It applies to that environment's flags, exports, imports and flag history; members, webhooks and
  the security log keep using the main role, and owners have full access everywhere. Set it with
  `environmentRoles` on `PUT /api/v1/users/{id}`, on the Members page, or with
  `flaghoist users role <email> <role> --env <environment>`. Access tokens still cap it, and
  `GET /api/v1/auth/me` reports the role per environment so the dashboard follows the environment
  being viewed. Changes are recorded in the security log.
- df25e09: Add member events on webhooks and an optional email sender. Webhooks can subscribe to
  `member.invited`, `member.joined`, `member.role_changed`, `member.disabled`, `member.enabled` and
  `member.removed`, with a `member` object in the payload. They are opt-in and never part of the
  default event list, so existing receivers only ever see flag events. Sign-ins, passwords, two-factor
  and access tokens are never sent to webhooks.
  
  `users.email` takes an object with `send({ to, subject, text, html })`; invites and password reset
  links are then emailed as well as shown, to the dashboard address the admin is using when its origin
  is allowed. No provider is bundled; the docs show Resend and Postmark in a few lines. A failed send
  is logged and the link still returned, and responses say whether the link was `emailed`.
- e16e668: Add invites and member management for user accounts. Admins create single-use invite links
  (bound to one email, valid 7 days by default via `users.invites.expiresInDays`) and pass them on
  themselves; opening one sets a password and signs in. A new Members page and
  `flaghoist users` commands change roles, disable, enable and remove members, and create 24-hour
  password reset links that sign out the member's other sessions. Only an owner can grant or act on
  the owner role, the last active owner cannot be demoted, disabled or removed, and nobody can
  change their own role. Demoting or disabling a member signs them out. Link tokens are stored only
  as hashes. Every change is recorded in the security log.
  
  The dashboard now follows the signed-in role: viewers see flags read-only, editors do not see
  import or delete, and Webhooks and Members appear only for admins and owners.
- 3f47819: Add two-factor sign-in for password accounts. Members set up codes from an authenticator app on
  the Account page (a QR code, one confirming code, and ten recovery codes shown once); signing in
  then asks for the current code after the password, in the dashboard and in `flaghoist login`
  (`--code` where there is no terminal). Codes work once, wrong codes count toward the sign-in
  lockout, recovery codes are single use, the secret is stored encrypted with a key derived from the
  pepper, and recovery codes only as hashes. `users.twoFactor: 'admins' | 'everyone'` makes it
  required; anyone who must have it is asked to set it up at their next sign-in and can do nothing
  else until they have. SSO sign-ins are exempt. Admins can turn it off for a member who lost their
  device, which signs them out everywhere. All of it is recorded in the security log.
  
  `signIn` and `acceptLink` in `@flaghoist/admin-client` now return a `TwoFactorChallenge` for such
  accounts; check with `isTwoFactorChallenge` and finish with `completeTwoFactor`.

### Patch Changes

- Updated dependencies [c7c4e6e]
- Updated dependencies [ee48117]
- Updated dependencies [83487f3]
- Updated dependencies [5346548]
- Updated dependencies [5346548]
- Updated dependencies [5346548]
- Updated dependencies [df25e09]
- Updated dependencies [e16e668]
- Updated dependencies [2840fc2]
- Updated dependencies [3f47819]
- Updated dependencies [af9fdf7]
- Updated dependencies [5346548]
  - @flaghoist/admin-client@0.3.0

## 0.3.1

### Patch Changes

- Updated dependencies [d5acde8]
  - @flaghoist/admin-client@0.2.0

## 0.3.0

### Minor Changes

- 7038d0d: Platform-aware scaffolding. `flaghoist deploy` now scaffolds a project that fits the target you pick:
  Cloudflare Workers as before, or a container (a `@hono/node-server` entry plus a `Dockerfile`) when
  you choose another platform. The container runs on any container or Node host, configured by
  environment variables, and the platform is written back to `flaghoist.toml` so a re-run or an
  `eject` keeps producing the same shape.
  
  - `flaghoist init` and `npm create flaghoist` take `--platform cloudflare|container`.
  - `flaghoist eject` generates the container file set (`server.mjs`, `Dockerfile`, `.dockerignore`,
    `package.json`) for a container project, and the Worker set otherwise.
  - `flaghoist deploy` with "Another platform" (or `--target other`) scaffolds the container and prints
    the next steps rather than only linking to docs. It does not deploy: container hosts differ enough
    that their own guides own the last mile.
  
  A container project cannot use Cloudflare KV, so its storage defaults to postgres. Existing projects
  are unaffected: an absent `platform` means Cloudflare, and a Worker config serializes exactly as
  before.

## 0.2.0

### Minor Changes

- 356343e: `flaghoist deploy` now asks where to deploy. Cloudflare Workers stays the built-in one-command path;
  choosing another platform prints links to the deployment guides (starting with Render) for running
  the same server on Node or a container. Skip the prompt with `--target cloudflare` or `--target
  other`, and when the command is not attached to a terminal it defaults to Cloudflare, so scripted
  `npm create flaghoist` and CI flows are unchanged.

## 0.1.3

### Patch Changes

- 8aff467: Pick up patch updates to the runtime dependencies these packages ship.
  
  `@flaghoist/server` moves to `hono` 4.13.3 and `jose` 6.2.9, `flaghoist` to `smol-toml` 1.8.0, and
  `@flaghoist/provider-web` to `@openfeature/ofrep-web-provider` 0.4.3. The bumps landed on `main`
  already; without a release they sit there and nobody installing from npm gets them.
  
  No behaviour of ours changes. `@flaghoist/vue` and `create-flaghoist` come along because they depend
  on `@flaghoist/provider-web` and `flaghoist` respectively.
- 806975b: Stop `eject` and `deploy` overwriting files that are already there.
  
  Both write `src/index.ts`, `wrangler.toml` and `package.json` into the current directory, and they
  wrote unconditionally. Run inside an existing application, which the quickstart suggested with
  "already inside a directory you want to use? `npx flaghoist init` does the same thing", the
  generated `package.json` replaced the real one. Its name, version, scripts and dependencies were
  gone, with no prompt and no warning.
  
  They now refuse, naming the files in the way and pointing at
  `npm create flaghoist@latest team-flags`, which makes a directory of its own and is safe to run
  from anywhere. An already-ejected project still gets told that instead.
  
  The docs no longer imply the service can live inside your app, and say plainly that Flaghoist
  deploys as its own service rather than as a library.

## 0.1.2

### Patch Changes

- 62407d6: Make `flaghoist deploy` work on a fresh project, and stop the KV namespace name colliding.

  Both of these were found by running the documented quickstart against a real Cloudflare account for
  the first time. Neither showed up against a stubbed wrangler.

  `deploy` wrote a `package.json` and a Worker that imports from it, then went straight to
  `wrangler deploy` without installing anything. The bundler could not resolve `@flaghoist/server`
  and the deploy failed before it reached Cloudflare, so `npm create flaghoist` followed by
  `npx flaghoist deploy` could never have worked. It now installs first, and skips that once the
  directory has a `node_modules`.

  The KV namespace was created with the title `FLAGS`. Titles are unique per Cloudflare account, so
  the first project in an account worked and every one after it failed on a name it never chose,
  including the separate staging and production instances the docs recommend. The title is now
  scoped to the project name, for example `team-flags-FLAGS`. The binding inside the Worker is still
  `FLAGS`, so nothing about the generated code changes.

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

- 1a638e4: Create the KV namespace during `flaghoist deploy`, so the quickstart works on the first try.

  A fresh project's `wrangler.toml` carried a literal `<your-kv-namespace-id>`, so on the default
  `cloudflare-kv` storage the very first command in the README failed: wrangler rejected the
  placeholder, and nothing in the CLI output or the docs said that `wrangler kv namespace create
FLAGS` had to be run first. The generated file had a comment pointing at it, which you only saw
  after the command had already failed.

  `deploy` now creates the namespace itself and writes the real id back into `wrangler.toml`. It only
  does this while the placeholder is there, so an id you pasted in yourself is never touched and
  repeat deploys reuse the namespace rather than making a new one. If wrangler fails, or prints an id
  this cannot read, the deploy stops with the manual command rather than continuing into a failure.

  `eject` prints the same command, since an ejected project runs wrangler on its own.

- 64c55a3: Add `create-flaghoist`, so `npm create flaghoist@latest team-flags` works.

  npm rewrites `npm create <name>` to the package `create-<name>`, so the command developers
  reflexively type — the convention Vite, Astro, Nuxt and Next all trained them on — was resolving to
  a package that did not exist and returning a 404. It scaffolds the directory (which `flaghoist init`
  does not) and writes `flaghoist.toml` into it.

  The `flaghoist` CLI now also exposes its config helpers (`serializeConfig`, `parseConfig`,
  `DEFAULT_CONFIG`, `STORAGE_KINDS`) as a library entry point. The scaffolder writes the config with
  the same serializer the CLI parses it back with, so the two cannot drift into a file one side
  writes and the other cannot read.

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
