---
'@flaghoist/adapter-cloudflare-kv': minor
---

Store flags under their own key by default, instead of namespacing them with `flag:`.

A flag called `checkout` is now the KV key `checkout`, so browsing the namespace in the Cloudflare
dashboard shows what you expect. Searching for a flag by name used to find nothing, because the key
was really `flag:checkout` and nothing said so.

Namespacing is still available and is now the caller's decision:

```ts
cloudflareKV(env.FLAGS, { prefix: 'flag:' })
```

That is the right shape for it. Sharing a KV namespace with other data is a choice you make about
your own infrastructure, and only you know whether you have. Without a prefix, `list()` reads every
key in the namespace; values that are not flags are skipped rather than appearing as broken rows, so
a shared namespace degrades rather than breaks, but you pay a read for each foreign key.

**This is breaking for an existing deployment.** Flags written under `flag:` are invisible to an
adapter that is no longer looking there. They are still in KV. To keep them, pass
`{ prefix: 'flag:' }` explicitly and nothing changes.
