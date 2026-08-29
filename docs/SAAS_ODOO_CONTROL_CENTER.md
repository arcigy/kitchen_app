# Arcigy SaaS Control Center in Odoo

This integration keeps raw logs, traces, request events, and high-frequency metrics outside Odoo. Odoo receives only bounded current or aggregated values.

## Hard environment boundary

- Every ingest request has exactly one `environment`: `develop` or `main`.
- Odoo stores current values under the unique key `(metric, environment, scope)`.
- Develop and Main are rendered as separate columns and are never averaged or overwritten across environments.
- The sync state also keeps independent cumulative-counter baselines for Develop and Main.

## Local sync command

Run the script with `npx tsx scripts/saasOdooMetricSync.ts` after supplying these environment variables through an approved secret store:

```text
ARCIGY_DEVELOP_URL
ARCIGY_MAIN_URL
ARCIGY_DEVELOP_METRICS_TOKEN
ARCIGY_MAIN_METRICS_TOKEN
ARCIGY_DEVELOP_RELEASE_VERSION
ARCIGY_MAIN_RELEASE_VERSION
ARCIGY_ODOO_URL
ARCIGY_ODOO_DATABASE
ARCIGY_ODOO_API_KEY
ARCIGY_SAAS_SYNC_STATE_FILE
```

The URL variables require HTTPS except for loopback development. The Odoo API key belongs to a dedicated user with only the `SaaS Integration Bot` group and must be rotated according to the Odoo policy. Do not put any value in Git, logs, dashboards, or chat.

The script reads `/metrics` and `/ready`, computes request count, availability, 5xx, rate-limit, in-flight, request rate, and window p50/p95/p99, then calls Odoo 19 JSON-2 method:

```text
POST /json/2/saas.metric.current/ingest_metric_batch
```

Domain aggregates use the same API-key user and call the allowlisted model directly, for example:

```text
POST /json/2/saas.endpoint.hourly/ingest_aggregate_batch
POST /json/2/saas.database.hourly/ingest_aggregate_batch
POST /json/2/saas.cost.daily/ingest_aggregate_batch
POST /json/2/saas.backup.run/ingest_operational_batch
POST /json/2/saas.restore.test/ingest_operational_batch
POST /json/2/saas.data.quality.run/ingest_operational_batch
```

The integration bot has read-only ACLs. These validated methods switch to elevated access only after checking the bot role, model allowlist, bounded batch, environment, dimensions, URLs, finite values, and environment-prefixed idempotency key. Direct JSON-2 `create`, `write`, and `unlink` are denied.

Retention is deliberately preview-only. `saas.metric.timeseries.retention_preview` reports candidates, but no cron deletes or hides rows until the retention policy, backup evidence, dry run, verification, and rollback are explicitly approved.

`npx tsx scripts/saasOdooRestoreDrillSync.ts` runs the existing fail-closed portable synthetic PostgreSQL restore drill and writes its passed evidence through `saas.restore.test/ingest_operational_batch`. It is hard-coded to `Develop`; synthetic evidence can never be represented as a Main/production restore. The wrapper records `application_smoke_passed=false` because database equivalence alone is not an application smoke test.

The first scrape intentionally does not claim RPS or a 5-minute latency percentile because a previous counter baseline does not yet exist.

## Current boundary

The repository exposes local Prometheus metrics but a centralized production metrics backend is not yet proven. This sync script is additive and is not wired into the application request path. Production scheduling, API-key creation, deployment, and external monitoring storage require a separately approved infrastructure change and live verification.
