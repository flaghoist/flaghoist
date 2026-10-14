---
'@flaghoist/server': patch
---

Fix webhooks not persisting when `createFlagServer` is given a config function. The function form, used on Cloudflare Workers to read `env`, left the webhook store resolving to memory instead of the configured storage, so webhooks added through the dashboard were lost. The store is now resolved per request from the active config.
