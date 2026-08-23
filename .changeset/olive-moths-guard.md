---
'flaghoist': patch
---

Stop `eject` and `deploy` overwriting files that are already there.

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
