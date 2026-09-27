---
'flaghoist': patch
'create-flaghoist': patch
---

Fix the interactive setup crashing on start with "Cannot read properties of undefined (reading 'bind')". Hidden input for secrets no longer relies on Node readline internals.
