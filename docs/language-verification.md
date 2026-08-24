# Verifying the language claims

The landing page lists Go, Java, Python, .NET, PHP, Ruby, Rust and JavaScript, and says every
language works on day one. Only JavaScript has ever been tested against a live server. This is the
procedure for checking the rest, and for deciding what to do when one fails.

The claim rests on one thing: the server implements the OFREP read path, so any OpenFeature SDK
with an OFREP provider should work with no Flaghoist-specific package. That is a claim about a
protocol, and protocols are exactly where "should" and "does" part company.

## Phase 0: confirm the claim is claimable

Before installing anything, confirm an official OpenFeature OFREP provider exists and is released
for each language. Check the OpenFeature contrib repositories and each language's package registry.

**Checked 2026-08-23.** Provider source in the OpenFeature contrib repositories, publication
confirmed against each language's own registry rather than a search API.

| Language   | Package                                                  | Registry      | Version |
| ---------- | -------------------------------------------------------- | ------------- | ------- |
| JavaScript | `@openfeature/ofrep-provider`                            | npm           | in use  |
| Go         | `github.com/open-feature/go-sdk-contrib/providers/ofrep` | Go proxy      | v0.1.5  |
| Python     | `openfeature-provider-ofrep`                             | PyPI          | 0.3.0   |
| Java       | `dev.openfeature.contrib.providers:ofrep`                | Maven Central | 0.0.2   |
| .NET       | `OpenFeature.Providers.Ofrep`                            | NuGet         | 0.1.5   |
| Ruby       | `openfeature-ofrep-provider`                             | RubyGems      | 0.1.2   |
| Rust       | `open-feature-ofrep`                                     | crates.io     | 0.1.2   |
| **PHP**    | **none exists**                                          | Packagist 404 | none    |

PHP is the exception. `php-sdk-contrib` ships CloudBees, Flagd, Flagsmith, GoFeatureFlag and Split,
and no OFREP provider. There is nothing on Packagist either. A PHP user cannot reach Flaghoist
through OpenFeature today, so the badge on the landing page is a promise the ecosystem cannot keep.
Take PHP off the list.

Note the version numbers. Java at 0.0.2 and Rust and Ruby at 0.1.x are early releases, so a pass
today is a statement about that version and not about the language forever.

If no provider exists for a language, no amount of testing helps. The landing page is promising
something a user cannot reach, and the fix is to remove it from the list rather than to write code.
Flaghoist does not imply a capability before it exists, and a language badge is a capability
claim.

Do this first. It costs half an hour and can save installing a toolchain to discover there is
nothing to install into it.

## Phase 1: one throwaway server

Use a dedicated deployment rather than an existing one, so flag state is known and nothing else is
disturbed.

```bash
cd /tmp && rm -rf langtest && mkdir langtest && cd langtest
npm create flaghoist@latest flaghoist-langtest
cd flaghoist-langtest && npx flaghoist deploy
```

Set the secrets, choosing values you do not mind existing in shell history for an hour:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put READ_API_KEY
```

Seed four flags. Each one exists to make a different failure visible:

```bash
export URL=https://flaghoist-langtest.<your-subdomain>.workers.dev
export ADMIN=<the ADMIN_TOKEN you set>

curl -X PUT "$URL/api/v1/flags/always-on" -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"rollout":{"percentage":100},"description":"Always true"}'

curl -X PUT "$URL/api/v1/flags/always-off" -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false,"rollout":{"percentage":100},"description":"Always false"}'

curl -X PUT "$URL/api/v1/flags/half-out" -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"rollout":{"percentage":50},"description":"Half the users"}'

curl -X PUT "$URL/api/v1/flags/pro-only" -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"rollout":{"percentage":0},"rules":[{"description":"Pro plan users","conditions":[{"attribute":"plan","operator":"eq","value":"pro"}],"result":{"enabled":true,"rollout":{"percentage":100}}}],"description":"Pro plan only"}'
```

Confirm the server itself is right before blaming any client:

```bash
curl -X POST "$URL/ofrep/v1/evaluate/flags" -H "x-api-key: $READ_KEY" \
  -H "Content-Type: application/json" \
  -d '{"context":{"targetingKey":"user-1","plan":"pro"}}'
```

All four flags should come back, with `pro-only` true. Run it again without `plan` in the context
and `pro-only` should flip to false. If either is wrong, stop: the problem is the server, not the
language.

A targeting rule nests its outcome under `result`, as `{"conditions": [...], "result": {"enabled":
true}}`. Flattening `enabled` alongside `conditions` is rejected with a 400, which is worth knowing
because it is an easy shape to get wrong by hand.

## Phase 2: the same six assertions everywhere

Every language runs an identical matrix. Uniformity is the point; a per-language script that tests
slightly different things proves nothing about the protocol.

1. **The provider initialises against the server.** This is the assertion most likely to fail and
   the most important one. See the note on `/ofrep/v1/configuration` below.
2. `always-on` evaluates to `true`.
3. `always-off` evaluates to `false`.
4. `does-not-exist` returns the supplied default and does not throw.
5. `pro-only` is `true` for a context with `plan=pro`, and `false` without it.
6. A **wrong API key** produces the default rather than a real value. Failing closed matters more
   than any of the above; a client that fails open silently turns everyone's flags on.

Give each language a throwaway directory under `/tmp/langtest`, a minimal project, the official
OFREP provider as the only dependency, and one file that runs the six assertions and prints a pass
or fail line per assertion. Delete the directory afterwards.

Work in this order, which is how loudly the site promises each one:

1. Go
2. Python
3. Java
4. .NET
5. PHP, Ruby, Rust, only if Phase 0 found real providers

### Stop early if Go fails assertion 1

The server implements `POST /ofrep/v1/evaluate/flags` and `/flags/:key` and nothing else. There is
no `GET /ofrep/v1/configuration`. Some OFREP providers call that endpoint when they initialise, to
discover polling intervals and whether the server supports event streams. The JavaScript provider
tolerates its absence, which is why JavaScript has always worked.

If a provider treats a missing configuration endpoint as fatal, every non-JavaScript language fails
in the same way at the same step. That is a server gap, not eight separate client problems, and it
is worth fixing once rather than working down the list collecting the same failure.

So: if Go fails at assertion 1, stop and look at the server.

## Phase 3: clean up and decide

```bash
cd /tmp/langtest/flaghoist-langtest
npx wrangler delete --name flaghoist-langtest
npx wrangler kv namespace list        # find flaghoist-langtest-FLAGS
npx wrangler kv namespace delete --namespace-id <id>
rm -rf /tmp/langtest
```

The toolchains installed for this are large. Remove the ones you will not use again.

The verdict is per language, never global:

| Outcome                | What it means                       | What to do                                 |
| ---------------------- | ----------------------------------- | ------------------------------------------ |
| All six pass           | The claim is true for that language | Keep it on the site                        |
| Only assertion 1 fails | Probably the configuration endpoint | Fix the server, then retest every language |
| Assertion 6 fails      | Client fails open on a bad key      | Serious. Investigate before launch         |
| Other assertions fail  | Provider or protocol mismatch       | Investigate individually                   |
| No provider exists     | The claim cannot be met             | Remove the language from the site          |

Record the result for each language in this file when the run is done, with the provider version
tested and the date. A claim that was true against one provider version is not automatically true
against the next, and the languages page is the first thing an OpenFeature user will check.

## Results

| Language   | Date       | Provider version                                             | Result                            |
| ---------- | ---------- | ------------------------------------------------------------ | --------------------------------- |
| JavaScript | 2026-08-23 | `@openfeature/ofrep-provider` via `@flaghoist/provider-node` | All six pass                      |
| Go         | 2026-08-23 | provider v0.1.7, go-sdk v1.18.0                              | All six pass, after the fix below |
| Python     | 2026-08-23 | provider 0.3.0, sdk 0.10.0                                   | All six pass                      |
| Ruby       | 2026-08-23 | provider 0.1.2, sdk 0.3.1                                    | All six pass                      |
| Java       | 2026-08-23 | provider 0.0.2, sdk 1.17.0                                   | All six pass                      |
| Rust       | 2026-08-23 | provider 0.1.2, sdk 0.3.0                                    | All six pass                      |
| .NET       | 2026-08-23 | provider 0.1.5, SDK 10.0.400                                 | All six pass                      |
| PHP        | 2026-08-23 | none exists                                                  | Removed from the site             |

Seven languages verified against a live server. The claim on the landing page is now evidence rather
than inference.

Assertion 6 is worth stating plainly because the output reads oddly: under a wrong API key every
provider returned the caller's default rather than the real flag value. No provider failed open, and
none leaked a value from a server that had rejected it.

Nothing surprising after Go. Every provider initialised without `/ofrep/v1/configuration`, honoured
the value for a disabled flag once the server reported `STATIC`, matched the targeting rule on
`plan=pro` and not without it, and returned the caller's default for an unknown key.

The three mistakes along the way were all mine and none were the product: the Ruby `Configuration`
class sits at `OpenFeature::OFREP` rather than under `Provider`, the Java options builder is reached
through `OfrepProviderOptions.builder()` because its constructor is package private, and the Rust
crate needs `open-feature` 0.3 and `reqwest` 0.13 rather than the older majors. Worth knowing if the
language guides get written, since a reader will hit the same three.

### What Go found

Assertion 1 passed, which retired the biggest worry: the Go provider initialises happily against a
server with no `/ofrep/v1/configuration`. The systemic failure that would have hit every language at
once does not exist.

Assertion 3 failed, and not as a transport bug. The server sent `value: false, reason: DISABLED`
for a disabled flag. Go discarded the value and returned the caller's default, because OpenFeature
reads `DISABLED` as "this flag is not participating, use your own default". JavaScript honoured the
value. The same flag on the same server was false in one language and true in the other.

It lands on the kill switch, which is the pattern where being wrong costs most: a Go service written
as `BooleanValue(ctx, "feature", true)` kept serving a feature after it had been switched off, while
the dashboard showed it off.

Fixed by reporting `STATIC` on the OFREP wire instead. `evaluate()` still returns `DISABLED`
internally and the admin API is unchanged. Both languages now return false whatever default is
passed.

This is the reason to keep running the remaining five. One provider reading the protocol
differently from another is invisible until two of them are put side by side on the same server.
