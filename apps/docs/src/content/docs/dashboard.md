---
title: Dashboard
description: Manage flags visually at /admin, no deploy required for a change.
---

Every deploy serves a management UI at `/admin`, built from the same single-file bundle the CLI
generates. There is no separate service to run and no vendor console to sign into. It makes no
request to anything outside your server: fonts, icons and styles are all inlined into that one file.

It is on by default. Set `dashboard = false` in `flaghoist.toml` to deploy the read and admin APIs
without it, and see [Self-hosting](/self-hosting/#serving-the-dashboard) for wiring it up by hand.

## Signing in

Open `https://<your-server>/admin` and enter your server URL and admin token. The token is kept in
the browser's local storage and sent only to that server. It is never sent anywhere else, and
nothing here can read it back out.

![The Flaghoist dashboard listing five flags, each with a toggle, a rollout slider, and a percentage.](/shot-flags.png)

## Finding a flag

The search field matches against both the key and the description. Filter chips narrow the list to
**live**, **paused**, or **targeted** flags, each showing a live count, so you can see how many
flags are in each state before you click.

Keyboard shortcuts work anywhere on the page:

| Key   | Action                            |
| ----- | --------------------------------- |
| `/`   | Focus search                      |
| `n`   | Open the new-flag editor          |
| `Esc` | Clear search, or close the editor |

## Changing a flag

Toggling a flag or dragging its rollout slider writes immediately; there is no separate save step
for those two actions. Click **Edit** to open the full editor for a description, the default
rollout, or targeting rules.

![The rule builder, showing a targeting rule that serves a flag to visitors whose country is DE, FR, ES, or IT.](/shot-rules.png)

A rule reads as a sentence: **if** a condition holds, **then serve** on or off, optionally to a
percentage of the matches. Rules are checked in order and the first match wins; a flag with no
matching rule falls back to its default rollout.

## Session and errors

A mid-session `401` or `403` (an admin token that expired or was revoked) signs you out and returns
you to the sign-in screen with an explanation, rather than leaving every action failing silently.
Any other failure is shown inline without ending the session. See [Authentication](/auth/) for how
tokens are validated server-side.

## Appearance

The theme button in the top bar switches between light and dark; the choice is remembered for that
browser. Left unset, the dashboard follows your operating system's preference.
