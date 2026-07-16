# Flaghoist examples

Runnable references for consuming and deploying Flaghoist. All use the standard OpenFeature
SDKs — the Flaghoist provider is just the OFREP provider, pre-wired for your server.

| Example              | What it shows                                                                                                                         | Run                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`node`](./node)     | Evaluate flags server-side via `@flaghoist/provider-node`. Self-contained: it stands up a server in-process and evaluates against it. | `pnpm --filter @flaghoist/example-node start` |
| [`vue`](./vue)       | Read flags in a Vue 3 app with `useFeatureFlag()`.                                                                                    | `pnpm --filter @flaghoist/example-vue dev`    |
| [`worker`](./worker) | Deploy the server itself as a Cloudflare Worker — the "one file you own."                                                             | `npx wrangler deploy` (in `examples/worker`)  |

A React example is the same shape as the Vue one: register `FlaghoistWebProvider` and read flags
with the official `@openfeature/react-sdk` `useFlag` hook.
