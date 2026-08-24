# Working in this repo

Standing rules for Claude Code. These hold across sessions unless the maintainer says otherwise.

## Authorship

- No Claude attribution in commits, PR bodies or changesets. This ships under Damilola's name.
- No em-dashes in shipped content. That covers code comments, docs, changesets, commit messages and
  every user-facing surface.

## Verification

- Verify against GitHub, npm and the working tree rather than trusting checkboxes. The launch
  checklist is kept locally and is not in this repository; a checked box there records what someone
  believed at the time, not what the tree contains. Check the thing itself before reporting it
  done.

## Product scope

The product brief that governs all user-facing copy is kept locally and is not in this repository.
What it requires, in full, is this. The shipped feature set is deliberately narrow:

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

## Running things

Hand over step by step instructions and let Damilola run them, rather than executing the steps
here. This applies to anything that touches a real account or real infrastructure: deploys, smoke
tests against Cloudflare, publishing, account and repo settings. Do the code changes, then write
the commands out in order, one per block, and say what each one should print. Run things directly
only when asked to.

## Answers

Keep them short. Lead with the result, then only what changes a decision. Use bullets or a small
table over paragraphs. Skip the recap of what was just done, skip restating the request, and skip
narrating the plan before doing it.
