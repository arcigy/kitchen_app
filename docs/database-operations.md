# Database operations

## Production topology

Arcigy API instances connect to PostgreSQL through CapRover's internal network. End-user browsers never connect to PostgreSQL and production does not use Vite or its HMR WebSocket.

Use one database with a separate validated schema per environment. Every tenant-owned query must remain scoped by `client_id`; tenant-specific catalogs and projects stay in PostgreSQL as the runtime source of truth.

## Connection pool

All PostgreSQL repositories share the pool owned by `src/core/database/postgres-client.ts`. The production default is 16 connections per API process and the development default is 8.

Available controls:

- `POSTGRES_POOL_MAX` (default: production 16, development 8)
- `POSTGRES_POOL_IDLE_TIMEOUT_MS` (default: 30000)
- `POSTGRES_CONNECT_TIMEOUT_MS` (default: 5000)
- `POSTGRES_QUERY_TIMEOUT_MS` (default: 30000)
- `POSTGRES_STATEMENT_TIMEOUT_MS` (default: 30000)

Keep `replica count * POSTGRES_POOL_MAX` below the PostgreSQL connection budget, leaving capacity for migrations, backups, monitoring and administration. Increase replicas only together with this calculation.

Broken or timed-out connections are destroyed instead of returned to the pool. Transient database failures return HTTP 503 with `Retry-After` and must not terminate the worker.

## Health and readiness

- `GET /health` is process liveness and does not query PostgreSQL.
- `GET /ready` checks the configured schema with `SELECT 1` and reports database latency. It returns HTTP 503 while the database is unavailable.

Route traffic only to replicas whose readiness endpoint succeeds. Alert on repeated readiness failures, connection-pool saturation, PostgreSQL connection usage, slow queries and error-rate spikes.

## Migrations

Run migrations before deploying code that requires a newer schema:

```powershell
$env:APP_ENV = "prod"
$env:DATABASE_SCHEMA = "prod"
$env:DATABASE_URL = "postgresql://..."
npm run db:migrate -- --schema prod
```

Each migration runs in its own transaction and is recorded in `schema_migrations`. Never point a non-production app environment at the production schema.

## Local development against the online tenant database

Use:

```powershell
npm run dev:online:postgres
```

This starts an authenticated local token bridge over an SSH host-key-verified tunnel, verifies the database connection, and then starts the API and Vite. The extra network latency is local-development overhead and is not representative of the internal production path.
