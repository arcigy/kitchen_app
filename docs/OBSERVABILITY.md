# Arcigy observability contract

Observability must explain user-visible failures without exposing customer data or creating unbounded telemetry cost.

## Implemented signals

- `/health`: process liveness only;
- `/ready`: database/schema readiness and latency, returning 503 with retry guidance when unavailable;
- `X-Request-Id`: generated for every request and reused in slow/error/audit evidence;
- slow request JSON: method, query-free path, status, duration, request ID;
- `mutation_audit`: static action, source, status/outcome, role, and HMAC-scoped references only;
- `/metrics`: worker uptime, request in-flight count, normalized route/status counters, and duration histogram;
- authenticated browser journey counters and duration histograms for `app_data_load` and `project_open`, split only by fixed app-data source plus open-type combinations and success/failure;
- authenticated browser runtime error counters plus long-task duration and best-available memory histograms, with fixed signal names and one fixed resource category only (`image`, `link`, `runtime`, `script`, `style`, or `unknown`), never diagnostic text or attribution;
- HTTP 413, 429, 503, and 5xx are visible through status metrics.

`src/server/workerRequestPipeline.ts` is the single owner of this HTTP security and observability boundary for both worker entrypoints. Entry-specific runtime routes are composed outside it and must not duplicate origin, readiness, authentication, budget, telemetry, audit, or public-error handling.

Production `/metrics` requires `ARCIGY_METRICS_TOKEN` and HTTPS. Never label metrics with tenant, user, project, session, file, token, query, supplier product, or request ID.

Browser reports are same-origin, authenticated, best-effort beacons with an 8 KiB request limit and exact allowlisted schemas. Journey payloads contain only `journey`, `variant`, `outcome`, and `durationMs`; runtime payloads contain only `signal`, numeric `value`, and, for failures, one fixed `kind` category. They contain no tenant, user, project, URL, stack, message, catalog, module, price, or attribution. Telemetry failure never blocks the measured product journey.

Runtime collection starts only after authentication. Error and unhandled-rejection listeners count events without reading their contents; errors add only a fixed element category when the browser exposes an element tag. The feature-detected [W3C Long Tasks API](https://www.w3.org/TR/longtasks-1/) contributes duration only, never task attribution. Memory sampling prefers the feature-detected [Measure Memory API](https://wicg.github.io/performance-measure-memory/) total and discards its URL/type breakdown; a Chromium compatibility fallback reports only `usedJSHeapSize`. Samples are capped per page, so the fallback is a trend signal rather than a cross-browser absolute comparison.

## Required dashboards

1. Core API: request rate, p50/p95/p99 duration, 4xx/429/5xx, in-flight, readiness, uptime/restarts.
2. Project journeys: list, cold/warm open, save, import, export/render duration and failure, browser long tasks/memory.
3. PostgreSQL: connections/pool wait, slow queries, locks, deadlocks, transactions, cache hit, CPU, memory, disk, WAL/archive and backup age.
4. Host/CapRover: disk/inodes, memory, CPU/load, network, container restarts, replicas, image/storage growth.
5. External dependencies: Gemini/Demos/supplier latency, timeout, size rejection, error rate, quota/cost.
6. Recovery: last full backup, last archived WAL, last verified restore, achieved RPO/RTO.

## Alert baseline

- disk warning at 80%, critical at 90%;
- `/ready` failure for two consecutive checks or elevated 503 rate;
- core API error rate above 1% excluding validated 4xx;
- project-open/save p95 above the approved SLO for two windows;
- sustained 429 growth or one tenant exhausting a resource budget;
- PostgreSQL pool/connection saturation, long transactions, lock waits, or backup/WAL failure;
- no verified restorable point within the approved RPO;
- any suspected cross-tenant event or repeated authorization failure pattern.

Every alert needs owner, severity, runbook link, threshold rationale, deduplication, and a recovery condition. Page on symptoms that threaten users or data, not every isolated log line.

## Centralization gap

Signals, including browser project-open/app-data timing and runtime errors/long tasks/memory, currently exist locally but no centralized metrics/log/trace backend has been proven live. Before multiple replicas or production SLO claims:

- choose and configure a protected collector/backend;
- encrypt transport/storage and restrict access;
- define retention and cost budgets;
- scrape each replica and PostgreSQL/host exporters;
- preserve request-ID correlation without storing payloads;
- exercise alerts and the incident runbook;
- add traces only after attribute redaction and sampling rules are tested.

See `docs/SAAS_SLO.md`, `docs/database-operations.md`, and `docs/SAAS_OPERATIONS_RUNBOOK.md`.
