# Security Policy

For the design-level security analysis — trust boundaries, threats per surface, and the
controls that mitigate them — see the [threat model](./docs/threat-model.md).

## Supported versions

Flaghoist is pre-1.0 and under active development. Security fixes are applied to the latest `0.x`
release line only, until a stable `1.0` is published.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via one of:

- GitHub's [private vulnerability reporting](https://github.com/flaghoist/flaghoist/security/advisories/new) (preferred), or
- email **security@flaghoist.dev**

Please include:

- a description of the vulnerability and its impact,
- steps to reproduce or a proof of concept,
- affected package(s) and version(s).

We aim to acknowledge reports within **3 business days** and to provide a remediation timeline after
triage. We will credit reporters in the release notes unless you prefer to remain anonymous.

## Scope notes

Flaghoist is infrastructure you self-host, so some security properties are your responsibility:

- **Secrets** (`ADMIN_TOKEN`, `READ_API_KEY`, OIDC config, database credentials) must be provided via
  your runtime's secret store, never committed to source.
- The **read/evaluate API** intentionally returns only evaluated booleans, never full flag config.
- The **admin API** must be protected by a strong bearer token or an OIDC verifier with group checks.
- When self-hosting, terminate TLS and restrict admin origins via the CORS allowlist.

Reports about these areas — especially any way to read flag configuration through the evaluate API, or
to mutate flags without valid admin credentials — are in scope and very welcome.
