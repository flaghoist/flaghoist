# Flaghoist in a container

One image, any host. `server.mjs` reads its whole configuration from environment variables and picks
the storage adapter at startup, so the same container runs on a VPS, Fly.io, Railway, DigitalOcean,
Cloud Run, ECS, or Kubernetes with no code to edit. It serves the OFREP read API, the admin API, and
the dashboard at `/admin`.

## Configuration

| Variable         | Required        | Default           | Notes                                            |
| ---------------- | --------------- | ----------------- | ------------------------------------------------ |
| `ADMIN_TOKEN`    | yes             |                   | Bearer token for the admin API and dashboard.    |
| `READ_API_KEY`   | yes             |                   | `x-api-key` for the OFREP read path.             |
| `FLAGS_STORAGE`  | no              | `memory`          | `postgres`, `redis`, or `memory`.                |
| `DATABASE_URL`   | when `postgres` |                   | Any Postgres connection string.                  |
| `REDIS_URL`      | when `redis`    |                   | Any Redis connection string.                     |
| `FLAGS_TABLE`    | no              | `flaghoist_flags` | Postgres table, for scoping per environment.     |
| `FLAGS_HASH_KEY` | no              | `flaghoist:flags` | Redis hash key, for scoping per environment.     |
| `FLAGS_CORS`     | no              |                   | Comma-separated browser origins allowed to read. |
| `PORT`           | no              | `8080`            | Most hosts set this for you.                     |

`memory` is for a quick look only: flags do not survive a restart. Use `postgres` or `redis` for
anything real.

## Run it

Build the image:

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

Or just kick the tyres with in-memory storage:

```bash
docker run -p 8080:8080 -e ADMIN_TOKEN=dev-admin -e READ_API_KEY=dev-read flaghoist
```

## Verify

```bash
curl http://localhost:8080/health
```

Create a flag from the dashboard at `http://localhost:8080/admin` (paste your `ADMIN_TOKEN`) or with
the CLI, then read it back:

```bash
curl -X POST http://localhost:8080/ofrep/v1/evaluate/flags/new-checkout \
  -H "x-api-key: $READ_API_KEY" -H "content-type: application/json" \
  -d '{"context":{"targetingKey":"tester-1"}}'
```

See the [Deploy with Docker](https://docs.flaghoist.dev/deploy/docker/) guide for pushing this to a
registry and running it on a specific host.
