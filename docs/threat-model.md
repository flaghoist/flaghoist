# Flaghoist threat model

This document maps where untrusted data enters Flaghoist, the threats at each boundary, and
the controls that mitigate them. It is the security specification the server (and any storage
adapter) is built against. It complements [SECURITY.md](../SECURITY.md), which covers how to
report vulnerabilities.

Status: living document. Some controls below are implemented in `@flaghoist/core` today;
those marked _(server)_ are specified here and implemented when the server lands.

## 1. Assets we protect

- **Integrity of flag state** — only authorized admins may create, change, or delete flags.
- **Availability of evaluation** — the read path must stay fast and cannot be wedged by a bad write.
- **Confidentiality of flag configuration** — the evaluate API exposes only booleans, never the
  rules, percentages, or descriptions behind them.
- **Admin credentials and secrets** — tokens, API keys, OIDC config, and database credentials.

## 2. Trust model

**Trusted:** the operator's own infrastructure — the deployed server process, its configured
storage backend, and the secrets held in the runtime's secret store.

**Untrusted (validate at the boundary):**

| Source                | What it sends                     | Why it's untrusted                                               |
| --------------------- | --------------------------------- | ---------------------------------------------------------------- |
| Client apps           | Evaluation context + read API key | Context is self-asserted; the read key ships in browser bundles  |
| Admin dashboard / CLI | Flag writes + admin token         | Token must be cryptographically verified; body is arbitrary JSON |
| Storage reads         | Stored flag JSON                  | Defense-in-depth: parse and validate even our own stored data    |

The core evaluation engine is pure (no I/O, no `eval`, no regex on input, zero dependencies)
and sits entirely inside the trust boundary. It only ever sees data that has crossed a
validation gate.

## 3. Threats and mitigations by surface

### 3.1 Read / evaluate path (public-facing)

- **The read API key is not a secret.** It is embedded in client bundles (`VITE_FLAGS_KEY`).
  Treat it as a coarse gate against drive-by scraping, not a confidentiality control. _(server)_
- **No configuration disclosure.** Evaluate endpoints return only resolved booleans plus an
  OFREP reason — never rule definitions, percentages, or descriptions. This is load-bearing.
- **Constant-time key comparison.** Compare the read key with `crypto.subtle.timingSafeEqual`
  (Workers) / `crypto.timingSafeEqual` (Node), never `===`, to avoid timing side channels. _(server)_
- **DoS via traffic.** Rate-limit the read path; back it with an in-memory/edge cache of flag
  definitions so bursts do not hammer storage. _(server)_
- **Flag enumeration.** OFREP's `FLAG_NOT_FOUND` reveals whether a key exists. Accept this as a
  minor, conscious trade-off; do not add richer error detail. _(server)_

### 3.2 Admin / write path (JWT / OIDC)

This is the richest footgun surface. _(server)_

- **Algorithm pinning.** Accept only the expected signature algorithm (`RS256`). Reject
  `alg: none` and never let the token's own `alg` header select the verification method —
  this blocks algorithm-confusion (e.g. RS256 → HS256 using the public key as an HMAC secret).
- **Full claim validation.** Verify signature, then `iss`, `aud`, `exp`, `nbf`, and `token_use`.
- **JWKS handling.** Fetch keys over HTTPS only, cache with a bounded TTL, and retry with fresh
  keys on a key-ID miss to survive rotation.
- **Authorization after authentication.** A valid token is necessary but not sufficient: require
  membership in an allowlisted admin group before any mutation. Defense in depth.
- **Body limits.** Enforce a maximum request body size and a JSON content-type before parsing,
  to cap memory/CPU spent on a malicious payload.

### 3.3 Storage adapters (injection)

- **Parameterized queries are mandatory** for any SQL-backed adapter. The adapter authoring
  guide must require bound parameters (`$1`, `?`) and forbid string-concatenated queries — this
  is where classic injection would live. KV/DynamoDB are key-value and injection-free.
- **Safe key handling.** Flag keys are restricted to `[A-Za-z0-9._-]`, start with an
  alphanumeric, and are length-bounded (`isValidFlagKey` in core). This removes path separators
  and control characters, closing traversal and key-injection for filesystem/SQL adapters.
- **Validate on read.** The server parses storage results through `parseFlag`, so corrupted or
  tampered stored data degrades to "flag ignored," never to a crash or a malformed evaluation.

### 3.4 Core evaluation engine

Implemented in `@flaghoist/core` today:

- **No dynamic code, no regex on input.** No `eval`/`new Function`; the `matches`/regex operator
  is deliberately excluded, so there is no ReDoS surface.
- **Prototype-pollution resistance.** `parseFlag` builds a fresh allowlisted object (never spreads
  input). Condition attribute names `__proto__`, `constructor`, and `prototype` are rejected at
  parse time, and evaluation reads only own properties (`Object.hasOwn`), so a crafted attribute
  name cannot reach the prototype chain.
- **Resource caps.** Bounded rules-per-flag, conditions-per-rule, list length, and value length
  (`LIMITS`), so a single flag cannot impose unbounded per-request evaluation cost.
- **Deterministic bucketing.** Percentage rollout uses SHA-256 sticky hashing; it is not a
  secret-keyed function and must not be treated as unpredictable.

### 3.5 Client SDKs

- **No local overrides in production.** The dev/QA localStorage override provider is disabled in
  production builds, so end users cannot flip hidden features via DevTools.
- **Least-privilege context.** SDKs send only the attributes targeting needs.

### 3.6 Supply chain & build

- **Minimal surface.** `@flaghoist/core` has zero runtime dependencies.
- **Locked and gated installs.** The lockfile is authoritative; dependency build scripts are
  gated (pnpm `allowBuilds`) and approved explicitly, not by default.
- **Publish provenance.** npm publishes run with provenance enabled from CI.

## 4. Explicit non-goals and caveats

- **A release flag is not an authorization boundary.** It controls whether a code path is
  _visible_, not whether a user is _allowed_. Never gate access to sensitive functionality on a
  release flag. Authorization is a separate, backend-enforced concern (see the partner-access
  vs. release-flag distinction in the design).
- **Targeting context is self-asserted.** Clients supply their own context attributes. When a
  targeting decision must be trustworthy, the server should derive the relevant attributes from
  the validated session/token and override client-supplied values. _(server)_
- **Percentage rollout is not access control.** A user who can influence their targeting key may
  be able to self-select into a bucket; rollouts gate release timing, not permissions.

## 5. Server implementation checklist (CP4)

- [ ] Read key compared in constant time
- [ ] JWT: algorithm pinned, `alg: none` rejected, `iss`/`aud`/`exp`/`nbf`/`token_use` verified
- [ ] JWKS fetched over HTTPS, cached with TTL, rotation retry
- [ ] Admin group membership enforced after authentication
- [ ] Request body size + content-type limits
- [ ] CORS: exact-origin allowlist, no wildcard with credentials
- [ ] Storage results parsed through `parseFlag`
- [ ] Errors do not leak stack traces or internal state
- [ ] Read path rate-limited and definition-cached
- [ ] Trusted-context injection supported for security-relevant attributes
