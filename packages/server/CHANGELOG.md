# @flaghoist/server

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
