# Flaghoist examples

Runnable references for consuming and deploying Flaghoist. All use the standard OpenFeature SDKs:
the Flaghoist provider is just the OFREP provider, pre-wired for your server.

| Example              | What it shows                                                                                                                         | Run                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`node`](./node)     | Evaluate flags server-side via `@flaghoist/provider-node`. Self-contained: it stands up a server in-process and evaluates against it. | `pnpm --filter @flaghoist/example-node start` |
| [`vue`](./vue)       | Read flags in a Vue 3 app with `@flaghoist/vue`'s `useFeatureFlag()`.                                                                 | `pnpm --filter @flaghoist/example-vue dev`    |
| [`react`](./react)   | Read flags in a React app with the official `@openfeature/react-sdk`. No Flaghoist-specific React package.                            | `pnpm --filter @flaghoist/example-react dev`  |
| [`worker`](./worker) | Deploy the server itself as a Cloudflare Worker, the "one file you own."                                                              | `npx wrangler deploy` (in `examples/worker`)  |

The Vue and React examples make the same point from two angles: Vue ships a `@flaghoist/vue`
convenience wrapper, while React uses the official `@openfeature/react-sdk` directly with just the
`FlaghoistWebProvider`. Neither needs a Flaghoist binding beyond the provider.

The client examples read against a local server. From the repo root, run `pnpm dev:server` (it seeds
a `new-checkout` flag and a `beta` flag with a targeting rule), then start an example in another
terminal.
