---
'@flaghoist/server': patch
---

Purge a legacy admin token left in `localStorage` by an older dashboard build.

The token moved from `localStorage` to `sessionStorage` so it no longer persists on disk, but a
dashboard built before that change may have already written one to `localStorage`, where the new code
never touched it, so it lingered indefinitely, which is exactly what the move was meant to prevent.
The dashboard now removes it once on load. New sessions have never used `localStorage`, so they are
unaffected.
