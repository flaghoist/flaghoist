# Recording the README demo GIF

`brand/demo.gif` is recorded, not hand-made, so it can be redone whenever the dashboard or the
example app changes. Everything below runs locally against real `workerd`, with no Cloudflare
account and nothing deployed.

## What the GIF shows

Four beats, about 15 seconds:

1. The Vue example on the legacy checkout, `new-checkout: off`.
2. The dashboard the server ships at `/admin`, signing in with an admin token.
3. The flag list, and one click on the toggle.
4. Back to the app, now live.

Beat 4 is real product behaviour, not a staged reload. The OFREP web provider ships with polling
off (`pollInterval: 0`) and this server advertises no SSE, so the app does not update while it sits
idle. It refetches when the page becomes visible again, which is what happens when you switch back
to your app's tab. That is the behaviour the GIF captures.

## Tools

```bash
brew install vhs gifski ffmpeg
npx playwright install chromium
```

`gifski` does the encoding; `ffmpeg` turns the recorded video into frames. `vhs` is only needed for
a terminal beat, which the local stage does not have (see the note at the end).

## The local stack

Two servers. The worker example needs three temporary edits, because it predates the dashboard
embed and its CORS allowlist points at a placeholder domain:

- import `dashboardHtml` from `@flaghoist/server/dashboard` and pass it as `dashboard`
- set `allowedOrigins: ['http://localhost:5173']`
- give the KV binding any local id, e.g. `demo_local_kv`

and a `.dev.vars` next to it:

```
ADMIN_TOKEN = "demo-admin-token"
READ_API_KEY = "read-key"
```

Then, from `examples/worker`:

```bash
npx wrangler dev --port 8787 --local
```

and from `examples/vue`:

```bash
npx vite --port 5173 --strictPort
```

Seed the flag so a single toggle click flips it all the way on. Enabled `false` at 100% rollout
evaluates to off, so the one click in beat 3 is the only change needed:

```bash
curl -X PUT http://localhost:8787/api/v1/flags/new-checkout \
  -H "Authorization: Bearer demo-admin-token" -H "Content-Type: application/json" \
  -d '{"enabled":false,"rollout":{"percentage":100},"description":"The redesigned checkout flow"}'
```

Flags are created with `PUT /api/v1/flags/:key`, not `POST`.

## Recording

Drive it with Playwright at 1400x850, recording video, then encode:

```bash
ffmpeg -i video.webm -vf "fps=14,scale=1400:-2:flags=lanczos" frames/%04d.png
gifski -o brand/demo.gif --fps 14 --quality 90 --width 1400 frames/*.png
```

Drop the first frame; Playwright's first captured frame is blank while the page paints.

Two things the script has to know. The dashboard prefills the Server URL field with its own origin,
so only the token needs typing, and typing into the URL field appends rather than replaces. The
toggle is `button.toggle`, and the flag key renders as `code.key`.

The result should land near 15 seconds, 1400px wide and well under a megabyte. The README renders
it at about 890px.

## Why there is no terminal beat yet

The shot list opens with `flaghoist deploy`. Recording that honestly needs the packages on npm,
since the commands a viewer would copy are `npm create flaghoist@latest` and `npx flaghoist deploy`,
and neither resolves before v0.1.0 ships. Rather than film a deploy that is not one, stage 1 starts
at the app. Stages 2 and 3 in `LAUNCH.md` add the real deploy once the release is out.
