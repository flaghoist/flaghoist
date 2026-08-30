---
title: Deploy with Docker
description: Run Flaghoist as a container on any host. One image, configured entirely by environment variables.
---

Flaghoist ships a portable container: **one image, configured entirely by environment variables**,
that runs on a plain VPS, Fly.io, Railway, DigitalOcean, Google Cloud Run, AWS ECS, or Kubernetes.
This is the least locked-in way to run it, and every other container host below just consumes this
image. The runnable source is in
[`examples/docker`](https://github.com/flaghoist/flaghoist/tree/main/examples/docker).

The entry picks its storage adapter at startup from `FLAGS_STORAGE`, so the same image works against
Postgres, Redis, or in-memory. (Workers KV is Cloudflare-only and is not a container option.)

## Scaffold it

The CLI generates the same files (`server.mjs`, `Dockerfile`, `.dockerignore`, `package.json`) into a
directory of your own, so you do not have to copy `examples/docker`:

```bash
npm create flaghoist@latest team-flags -- --platform container
cd team-flags
npx flaghoist eject
```

`npx flaghoist deploy` and choosing **Another platform** does the same scaffolding from an existing
`flaghoist.toml`. Either way you get the container project below to build and run.

## Configuration

| Variable         | Required        | Default           | Notes                                            |
| ---------------- | --------------- | ----------------- | ------------------------------------------------ |
| `ADMIN_TOKEN`    | yes             |                   | Bearer token for the admin API and dashboard.    |
| `READ_API_KEY`   | yes             |                   | `x-api-key` for the OFREP read path.             |
| `FLAGS_STORAGE`  | no              | `memory`          | `postgres`, `redis`, or `memory`.                |
| `DATABASE_URL`   | when `postgres` |                   | Any Postgres connection string.                  |
| `REDIS_URL`      | when `redis`    |                   | Any Redis connection string.                     |
| `FLAGS_TABLE`    | no              | `flaghoist_flags` | Postgres table, to scope per environment.        |
| `FLAGS_HASH_KEY` | no              | `flaghoist:flags` | Redis hash key, to scope per environment.        |
| `FLAGS_CORS`     | no              |                   | Comma-separated browser origins allowed to read. |
| `PORT`           | no              | `8080`            | Most hosts set this for you.                     |

`memory` is for a quick look only: flags do not survive a restart. Use `postgres` or `redis` for
anything real.

## Build and run

From the scaffolded project (or a copy of `examples/docker`):

```bash
docker build -t flaghoist .
```

Against Postgres:

```bash
docker run -p 8080:8080 \
  -e FLAGS_STORAGE=postgres \
  -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e READ_API_KEY="$(openssl rand -hex 32)" \
  flaghoist
```

## Push it once, run it anywhere

```bash
docker tag flaghoist ghcr.io/you/flaghoist:latest
docker push ghcr.io/you/flaghoist:latest
```

Any container host then pulls and runs the same image with the same environment: Fly.io (`fly launch`
against the image), Railway (deploy from the Dockerfile), DigitalOcean App Platform, Cloud Run, ECS,
or `docker run` on a VPS. Nothing about the image is host-specific.

## Verify

```bash
curl http://localhost:8080/health
```

Create a flag from the dashboard at `http://localhost:8080/admin` (paste your `ADMIN_TOKEN`) or with
the CLI, then read it back exactly as your app would:

```bash
curl -X POST http://localhost:8080/ofrep/v1/evaluate/flags/new-checkout \
  -H "x-api-key: $READ_API_KEY" -H "content-type: application/json" \
  -d '{"context":{"targetingKey":"tester-1"}}'
```

## Notes

- Set `FLAGS_TABLE` (Postgres) or `FLAGS_HASH_KEY` (Redis) to keep environments apart. See
  [Storage adapters](/storage-adapters/).
- Managed Postgres (Supabase, Neon, Render) requires TLS; the entry enables it unless your
  `DATABASE_URL` already sets `sslmode`.
- Set `FLAGS_CORS` if a browser app reads flags cross-origin. Server-side reads need nothing.
