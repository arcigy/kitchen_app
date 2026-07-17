# Database operations

## Production topology

Arcigy API instances connect to PostgreSQL through CapRover's internal network. End-user browsers never connect to PostgreSQL and production does not use Vite or its HMR WebSocket.

Use one database with a separate validated schema per environment. Every tenant-owned query must remain scoped by `client_id`; tenant-specific catalogs and projects stay in PostgreSQL as the runtime source of truth.

## Production runtime contract

Both worker entrypoints call `assertWorkerRuntimeEnvironment` before repository creation. When `NODE_ENV=production`, startup fails closed unless all of these are explicit and aligned:

```text
KITCHEN_PROJECT_STORAGE=postgres
APP_ENV=dev   DATABASE_SCHEMA=dev   ARCIGY_OBJECT_STORAGE_PREFIX=dev
APP_ENV=prod  DATABASE_SCHEMA=prod  ARCIGY_OBJECT_STORAGE_PREFIX=prod
DATABASE_URL or a complete supported PostgreSQL component configuration
```

This runtime guard protects manual starts and configuration drift that bypass the deploy workflow. It does not prove that `/app/storage` is mounted durably; the CapRover preflight and a redeploy checksum test remain mandatory for that evidence. Local/test runtimes may continue to use isolated file storage.

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

## Metrics

`GET /metrics` exposes low-cardinality Prometheus text metrics for request rate, normalized routes, status, duration buckets, in-flight requests, and worker uptime. It never labels tenant, project, user, file, or query values.

Production returns 404 unless `ARCIGY_METRICS_TOKEN` is configured. The scraper must use `Authorization: Bearer <token>` over HTTPS. See `docs/SAAS_SLO.md` and `docs/SAAS_OPERATIONS_RUNBOOK.md`.

## Request budgets

Expensive catalog, project import/save, assistant, Demos lookup, and Blender export routes use a bounded per-tenant request/concurrency budget. Unauthenticated external lookups fall back to the direct peer address. Normal requests are unchanged; exhausted budgets return HTTP 429 with `Retry-After` and are visible in the HTTP metrics.

The guard is intentionally process-local and bounds its own memory. When the API runs more than one replica, replace or complement it with a shared tenant-aware limiter at the trusted gateway or durable coordination layer. Do not use user, tenant, or project identifiers as metric labels.

## Project write retries

Project create, save, import, and version restore use tenant-and-route-scoped `Idempotency-Key` hashes. Create/import receipts are stored inside private repository metadata and stripped from all public project responses. Save receipts and a monotonic save revision live in the project save JSON, so file and PostgreSQL repositories share the same behavior without a schema migration.

An exact retry returns the original resource/save. Reusing a key for a different payload or saving against a stale revision returns HTTP 409. Do not automatically retry 409: reload the project and let the user reconcile the newer state. Raw keys and request bodies must never enter logs or metrics.

## Privacy-safe mutation audit

Unsafe API methods emit `mutation_audit` JSON after completion. The record contains a static action, request ID, status/outcome, source type, role, and HMAC references only. Set `ARCIGY_AUDIT_HASH_SECRET` in production so audit correlation is independent from session-secret rotation. See `docs/SECURITY.md` and `docs/OBSERVABILITY.md`.

## Authentication sessions

New logins create a row in `arcigy_auth_sessions`. Every authenticated API request checks that row is unexpired, belongs to the signed user and organization, and is not revoked. Logout revokes the row before clearing the cookie. Session IDs stay inside the signed HttpOnly cookie and are omitted from JSON responses and logs.

Cookies from releases before this server-side control contain no session ID and remain valid only until their existing signed expiry, at most seven days after issue. Do not rotate `AUTH_SESSION_SECRET` merely to accelerate rollout because that immediately signs out every user. Add an approved periodic purge for expired/revoked rows before treating session retention as operationally complete.

## Migrations

Run migrations before deploying code that requires a newer schema:

```powershell
$env:APP_ENV = "prod"
$env:DATABASE_SCHEMA = "prod"
$env:DATABASE_URL = "postgresql://..."
npm run db:migrate -- --schema prod
```

Each migration runs in its own transaction and is recorded in `schema_migrations`. Never point a non-production app environment at the production schema.

The worker checks the complete repository migration manifest before serving database work. `/ready` returns unavailable when any expected migration is missing; it does not repair or modify the schema. Keep the manifest synchronized with `db/migrations/*.sql` and run its regression test whenever a migration is added.

Do not benchmark full-catalog JSONB reconstruction, `jsonb_set` projection, or whole-row `catalog::text` transformations on the live shared host. A read-only full projection can still saturate CPU and make SSH/HTTPS temporarily unavailable. Measure field sizes with bounded aggregates and an explicit `statement_timeout`, or run the exact projection against an isolated restored copy. Read-only does not mean operationally harmless.

## Isolated synthetic backup and restore drill

The repository includes a fail-closed `pg_dump`/`pg_restore` drill. It creates either its own labelled PostgreSQL 16 Docker container or a user-owned portable PostgreSQL 16 cluster under the operating-system temp directory, applies every migration twice, inserts only synthetic two-tenant project/catalog/module/pricing/BOM/asset data, restores a custom-format backup into a second disposable database, and compares exact table counts and row digests plus migrations, constraints, indexes, representative project data, and a tenant-negative query.

It refuses every pre-existing database URL, remote Docker endpoint, unsafe image, database name, or unlabelled cleanup target. Run only with a local Docker engine:

```powershell
$env:ARCIGY_RESTORE_DRILL_ISOLATED = "true"
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:KITCHEN_PROJECT_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:PROJECT_DATABASE_URL -ErrorAction SilentlyContinue
npm run test:db-restore-drill
```

This proves the repository migration and logical restore path on synthetic data. Separately, the filesystem backup runner now has a real encrypted production artifact, daily shared-Google-Drive schedule, weekly latest-artifact restore schedule, and exact isolated real-restore evidence recorded in the SaaS audit. WAL/PITR remains intentionally deferred while the selected RPO is 24 hours; require it before approving a tighter RPO.

When Docker is unavailable, use the portable backend with an explicitly reviewed PostgreSQL 16 binary directory:

```powershell
$env:ARCIGY_RESTORE_DRILL_ISOLATED = "true"
$env:ARCIGY_RESTORE_DRILL_POSTGRES_BIN = "C:\path\to\pgsql\bin"
npm run test:db-restore-drill:portable
```

The portable runner binds only a random loopback port, creates random restore-drill database names, never installs a Windows service, detects a partially started server through `postmaster.pid`, stops it in `finally`, and removes only its exact temp namespace. Obtain Windows binaries through the [official PostgreSQL Windows download page](https://www.postgresql.org/download/windows/) and its EDB binary-archive link; record the archive version, size, and SHA-256 because the archive executables are not Authenticode-signed.

## Local development against the online tenant database

Use:

```powershell
npm run dev:online:postgres
```

This starts an authenticated local token bridge over an SSH host-key-verified tunnel, verifies the database connection, and then starts the API and Vite. The extra network latency is local-development overhead and is not representative of the internal production path.
