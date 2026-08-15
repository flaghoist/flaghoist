# Flaghoist brand kit

The mark is a **swallowtail signal flag on a halyard** — the naval flag hoist that gives the project
its name. Raising your own signal, on your own line. Keep it geometric, flat, and confident; lightly
nautical, never kitschy.

## Assets

| File            | Use                                                       |
| --------------- | --------------------------------------------------------- |
| `icon.svg`      | App icon, favicon source, GitHub org avatar. Square mark. |
| `icon-mono.svg` | Single-colour mark, inherits `currentColor`.              |
| `logo.svg`      | Horizontal lockup for light backgrounds.                  |
| `logo-dark.svg` | Horizontal lockup for dark backgrounds.                   |
| `banner.svg`    | README / social header (1280×400).                        |
| `og.png`        | Social share card, 1200×630. Generated, see below.        |

`icon-mono.svg` is the same mark with no fill attributes, so it inherits `currentColor`. Use it
wherever a directory or third party asks for a single-colour logo.

## Type

| Role                      | Face           | Weight   |
| ------------------------- | -------------- | -------- |
| Wordmark, headings, UI    | **Geist Sans** | 400, 600 |
| Code, flag keys, numerals | **Geist Mono** | 400, 500 |

Geist is licensed **OFL-1.1**, so it can be redistributed inside our own builds, and it is
self-hosted everywhere it is used (via `@fontsource/geist-sans` and `@fontsource/geist-mono`).

Do not load it, or any other face, from a third-party CDN. The admin console ships inside the
operator's own infrastructure, so a webfont request to someone else's domain breaks air-gapped
deployments and contradicts the compliance boundary the product is sold on. The console inlines its
fonts into the single-file bundle for exactly this reason.

In `logo.svg`, `logo-dark.svg` and `banner.svg` the wordmark is live text so it stays editable.
Outline it before handing those files to anyone outside the project, so rendering never depends on
the viewer having Geist installed.

## Palette

| Token           | Hex       | Role                                             |
| --------------- | --------- | ------------------------------------------------ |
| Ink (navy)      | `#0B1E3A` | Primary brand color, text on light, dark surface |
| Ink 2           | `#17335C` | Secondary navy, hovers, borders on dark          |
| Signal orange   | `#FF4A1F` | Accent, calls to action, the flag itself         |
| Sail            | `#F7F4EC` | Off-white surface / text on dark                 |
| Slate           | `#8B9AB0` | Muted text on dark                               |
| Flag on (green) | `#1D9E75` | Dashboard: flag enabled state                    |
| Flag off (red)  | `#E24B4A` | Dashboard: flag disabled state                   |

## Voice

"Own your flags." Confident, infrastructure-minded, developer-first. We compare honestly, we don't
oversell (a KV kill switch is "within a minute on next load," not "instant"), and we never punch down
at the tools we're an alternative to.

## Generated assets

The PNGs are built from the SVGs rather than edited by hand, so they cannot drift from the mark:

```bash
node scripts/gen-brand-png.mjs   # icon.png, icon-1024.png, avatar.png, avatar-navy.png, og.png
```

`og.png` is written to both `brand/` and `apps/web/public/`. Re-run it after any change to the mark
or to the landing page's headline, which the card repeats.

## Don'ts

- Don't recolor the flag away from signal orange — it's the one load-bearing accent.
- Don't add gradients, bevels, or drop shadows to the mark. It stays flat.
- Don't stretch the lockup or change the icon-to-wordmark spacing.
- Don't load fonts from a CDN in anything that ships to an operator. Self-host or inline.
