---
'flaghoist': minor
'create-flaghoist': minor
---

Interactive setup. `npm create flaghoist@latest` and `flaghoist init` now ask for the project name, platform, storage, accounts, single sign-on and the dashboard, with flags to skip each question. Accounts are on by default: setup generates an `AUTH_PEPPER` (or takes one you paste), prints it once and keeps it in a git-ignored `.env`, never in `flaghoist.toml`. `flaghoist deploy` on Cloudflare sets it on the Worker, and never replaces a secret the Worker already has. Generated projects now use `@flaghoist/server` 0.4.
