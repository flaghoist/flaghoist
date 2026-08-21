# Working in this repo

Standing rules for Claude Code. These hold across sessions unless the maintainer says otherwise.

## Authorship

- No Claude attribution in commits, PR bodies or changesets. This ships under Damilola's name.
- No em-dashes in shipped content. That covers code comments, docs, changesets, commit messages and
  every user-facing surface.

## Verification

- Verify against GitHub, npm and the working tree rather than trusting checkboxes. `LAUNCH.md`
  tracks launch state, but a checked box records what someone believed at the time, not what the
  tree contains. Check the thing itself before reporting it done.

## Product scope

`PRODUCT.md` governs all user-facing copy. The shipped feature set is deliberately narrow:

- Boolean flags only. No multivariate, no experiments.
- No named segments, no scheduled rules, no regex operators.
- No optimistic concurrency, no pagination.

Do not describe any of the above as existing, planned or coming soon in docs, the landing page or
the dashboard. Never fabricate social proof: no invented user counts, testimonials or logos. Keep
the losing rows in the comparison table, the honesty is the point.

## Design

- WCAG 2.1 AA on every surface.
- Geist, self-hosted. Never load fonts from a CDN. The admin dashboard is served from a Worker with
  no guaranteed network egress, and it previously shipped calling Google for fonts.
