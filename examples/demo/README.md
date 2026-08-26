# flaghoist-demo

The worker behind `demo.flaghoist.dev`: a normal Flaghoist server set up as a public sandbox that
cannot cost anything and cannot be trivially abused.

It is the same code as `examples/worker`, plus a seed, a scheduled reset, and a read-only fallback
switch. The real protection is not in this code; it is four Cloudflare guardrails you configure once,
described below.

Two surfaces are served:

- **`/`** and **`/playground`**: a read playground that calls the OFREP endpoint the same way an app
  would, so a visitor can set a targeting context, evaluate the flags, and watch values change. This
  is the OpenFeature read path made visible, rather than left implied by an admin-only demo.
- **`/admin`**: the admin dashboard, where a visitor toggles and creates flags. The demo's copy
  auto-connects with the public admin token, so a visitor lands on the flags without a login screen;
  they can still Disconnect, and a reload signs them back in.

## The four guardrails

1. **Stays on the free tier, so it can never bill you.** The account runs on the Workers Free plan.
   Past 1,000 KV writes a day the free tier simply rejects further writes until midnight UTC; it
   never charges an overage. That plan choice is the hard guarantee. Everything else keeps normal use
   well under the cap so you never actually hit it.
2. **A dedicated KV namespace.** Nothing else shares it, so its usage is clean to read and a spike is
   obviously the demo, not your other data.
3. **Humans only, via a WAF Managed Challenge.** Cloudflare's challenge platform (the same technology
   as Turnstile) gates the write surface, so a bot cannot script a write flood. A human solves it
   once on the dashboard and edits freely for the clearance window; a script never gets in.
4. **A hard rate limit on writes.** A WAF Rate Limiting rule caps `PUT`/`DELETE` per IP, so even a
   human with clearance cannot hammer writes fast enough to burn the daily budget.

Reads are deliberately left alone: the OFREP read path is cheap, cached in the worker, and needs to
stay scriptable so people can point an app at it.

## Standing it up

Run these from `examples/demo`. One command per step; the comment says what it should print.

### 1. Confirm the account is on the Workers Free plan

This is the no-bill guarantee. In the Cloudflare dashboard, the account's Workers & Pages plan should
read **Free**. If the account must be Paid for other reasons, KV overages there can bill, so use a
separate Free account for the demo instead.

### 2. Install and create the dedicated namespace

```bash
pnpm install
```

```bash
npx wrangler kv namespace create flaghoist-demo-FLAGS
```

Prints `id = "..."`. Paste it into the `kv_namespaces` binding in `wrangler.toml`.

### 3. Set the two public tokens

Generate each with `openssl rand -hex 32` (32 hex chars, so the weak-secret warning never fires) and
keep them; you will publish them on the demo page.

```bash
npx wrangler secret put ADMIN_TOKEN
```

```bash
npx wrangler secret put READ_API_KEY
```

### 4. Deploy

`wrangler.toml` declares `demo.flaghoist.dev` as a custom domain on a zone already in the account, so
Cloudflare creates the DNS record and TLS certificate automatically, and registers the hourly reset
cron.

```bash
npx wrangler deploy
```

### 5. Seed it now

Trigger the scheduled handler once rather than waiting for the top of the hour:

```bash
npx wrangler dev --test-scheduled
```

Then, from another terminal, hit the route it prints:

```bash
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

The three seed flags now exist. Stop `wrangler dev`.

### 6. Add the Managed Challenge (the human gate)

In the Cloudflare dashboard, on the `flaghoist.dev` zone, under **Security > WAF > Custom rules**,
create a rule:

- **When**: `Hostname equals demo.flaghoist.dev` AND (`URI Path starts with /admin` OR
  `Request Method is in {PUT, DELETE}`)
- **Then**: **Managed Challenge**

Challenging `/admin` gives a visitor clearance on page load, before their first edit; the method
clause is the backstop for a direct API write. Reads (`POST /ofrep/...`, `GET`, `/health`) are never
matched, so apps and the read API keep working.

### 7. Add the write rate limit (hard cap)

Under **Security > WAF > Rate limiting rules**, create:

- **When**: `Hostname equals demo.flaghoist.dev` AND `Request Method is in {PUT, DELETE}`
- **Rate**: 6 requests per 1 minute, **per IP**
- **Then**: Block, for 10 minutes

The Free plan includes one rate-limiting rule, which this uses. Six writes a minute, one every ten
seconds, is enough for a human toggling flags but leaves no room to script the daily budget away, and
the 10 minute block makes a script that trips it go quiet rather than retry every minute. The true
ceiling on spend is still the Free plan itself, which rejects writes past the 1,000 a day cap and
never bills; this rule and the hourly reset just keep normal use well under it.

### 8. Add a usage alert

Under **Notifications**, add a billing/usage alert for the account so a surprise in Workers or KV
usage reaches you. There is no hard per-namespace write quota to set; this alert plus the Free plan's
auto-reject at 1,000 writes/day is the ceiling.

## Verify

```bash
curl https://demo.flaghoist.dev/health
```

```bash
curl -s -X POST https://demo.flaghoist.dev/ofrep/v1/evaluate/flags/new-checkout \
  -H "x-api-key: <the READ_API_KEY you set>" \
  -H "content-type: application/json" \
  -d '{"context":{"targetingKey":"tester-1"}}'
```

The read returns `"value": true`. A scripted write should be challenged and fail:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  https://demo.flaghoist.dev/api/v1/flags/new-checkout \
  -H "authorization: Bearer <the ADMIN_TOKEN you set>"
```

Expect a challenge (403), not a 204. Editing the same flag from the dashboard in a browser, after
solving the challenge once, works.

## The Option A fallback

If write abuse ever becomes a problem, freeze the sandbox read only without a redeploy:

```bash
npx wrangler secret put DEMO_READONLY
```

Enter `1`. Every `PUT`/`DELETE` is then rejected at the worker edge, so writes are off even if the
admin token is already public; the dashboard stays browsable and the read API is untouched. The
hourly reset also stops, since there is nothing to reset. Return to the interactive sandbox with:

```bash
npx wrangler secret delete DEMO_READONLY
```

## After it is live

- Publish `ADMIN_TOKEN`, `READ_API_KEY` and the base URL on the demo page, with a line that says the
  sandbox resets hourly.
- Send people to `demo.flaghoist.dev` (the read playground), which links through to the dashboard.
- Point the demo GIF's browser beat at the playground, then the dashboard, then back, so it shows
  the toggle changing the read value.
