# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets). Every user-facing
change to a published `@flaghoist/*` package should ship with a changeset.

Add one with:

```bash
pnpm changeset
```

Pick the packages you changed, choose a semver bump (patch/minor/major), and write a short summary —
it becomes the changelog entry. While the project is pre-1.0, prefer `minor` for features and `patch`
for fixes; reserve `major` for deliberate breaking changes to a stabilized API.
