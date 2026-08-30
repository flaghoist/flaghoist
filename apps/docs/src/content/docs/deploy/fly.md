---
title: Deploy to Fly.io
description: Run the Flaghoist container on Fly.io, backed by Fly Postgres or any managed Postgres.
---

Fly.io runs the [Docker image](/deploy/docker/) directly. You deploy the container from
`examples/docker` and back it with Postgres. About ten minutes.

## 1. Install flyctl and sign in

Install [flyctl](https://fly.io/docs/flyctl/install/), then:

```bash
fly auth login
```

## 2. Launch the app

From a copy of `examples/docker` (it has the `Dockerfile`):

```bash
fly launch --no-deploy
```

Answer the prompts for a name and region. `fly launch` detects the Dockerfile and writes a
`fly.toml`. Make sure its `[http_service]` block has `internal_port = 8080`, the port the container
listens on.

## 3. Attach Postgres

```bash
fly postgres create               # creates a Postgres app
fly postgres attach <pg-app-name> # sets DATABASE_URL on your app
```

Fly's internal Postgres is reached over the private network without TLS, so append `?sslmode=disable`
to the connection string it set, otherwise the container tries to negotiate SSL and the connection
fails:

```bash
fly secrets set DATABASE_URL="postgres://…internal:5432/<db>?sslmode=disable"
```

Any managed Postgres works too (Supabase, Neon), using its own URL. Those require TLS, which the
container enables by default, so no `sslmode` is needed.

## 4. Set the rest of the config

```bash
fly secrets set FLAGS_STORAGE=postgres \
  ADMIN_TOKEN="$(openssl rand -hex 32)" \
  READ_API_KEY="$(openssl rand -hex 32)"
```

## 5. Deploy

```bash
fly deploy
```

Fly gives you `https://<app>.fly.dev`.

## 6. Verify

```bash
curl https://<app>.fly.dev/health
```

Create a flag from the dashboard at `https://<app>.fly.dev/admin` (paste your `ADMIN_TOKEN`), then
read it back:

```bash
curl -X POST https://<app>.fly.dev/ofrep/v1/evaluate/flags/new-checkout \
  -H "x-api-key: $READ_API_KEY" -H "content-type: application/json" \
  -d '{"context":{"targetingKey":"tester-1"}}'
```

Everything Docker-specific is in [Deploy with Docker](/deploy/docker/); Fly just runs that image.
