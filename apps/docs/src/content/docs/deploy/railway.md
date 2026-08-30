---
title: Deploy to Railway
description: Run the Flaghoist container on Railway, backed by a Railway Postgres.
---

Railway builds the [Docker image](/deploy/docker/) from your repo and runs it, with a Postgres
alongside. Mostly point-and-click.

## 1. Create the service

- Push the container project to a GitHub repo: scaffold it with
  `npm create flaghoist@latest team-flags -- --platform container`, or use a copy of `examples/docker`
  (or the whole Flaghoist repo).
- In the [Railway](https://railway.app) dashboard: **New Project > Deploy from GitHub repo**, and pick
  it.
- In the service **Settings**, set the **Root Directory** to `examples/docker` so Railway builds that
  `Dockerfile`.

## 2. Add Postgres

In the project: **New > Database > PostgreSQL**. Railway provisions it and exposes a `DATABASE_URL`
you can reference from the service.

## 3. Set the variables

On the Flaghoist service, add these **Variables**:

- `FLAGS_STORAGE` = `postgres`
- `DATABASE_URL` = `${{Postgres.DATABASE_URL}}?sslmode=disable`
- `ADMIN_TOKEN` = a strong secret (`openssl rand -hex 32`)
- `READ_API_KEY` = a strong secret

`${{Postgres.DATABASE_URL}}` references the database's private URL, which is not TLS, so the
`?sslmode=disable` tells the container not to negotiate SSL. Railway sets `PORT` for you, and the
container reads it.

## 4. Deploy and expose

Railway builds and deploys on push. In the service **Settings > Networking**, click **Generate
Domain** to get a public HTTPS URL like `https://<app>.up.railway.app`.

## 5. Verify

```bash
curl https://<app>.up.railway.app/health
```

Create a flag from the dashboard at `https://<app>.up.railway.app/admin` (paste your `ADMIN_TOKEN`),
then read it back:

```bash
curl -X POST https://<app>.up.railway.app/ofrep/v1/evaluate/flags/new-checkout \
  -H "x-api-key: $READ_API_KEY" -H "content-type: application/json" \
  -d '{"context":{"targetingKey":"tester-1"}}'
```

Everything container-specific is in [Deploy with Docker](/deploy/docker/); Railway just runs that
image.
