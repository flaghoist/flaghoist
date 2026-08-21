---
'@flaghoist/server': minor
'flaghoist': minor
---

Ship the admin dashboard with `flaghoist deploy` and `flaghoist eject`, so `/admin` works out of the
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
