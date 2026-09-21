# Arcigy SaaS load-test plan

The harness is `npm run test:saas-load`. It is read-only and refuses to run unless the operator explicitly declares the target isolated.

## Hard safety gate

Required for every run:

```powershell
$env:ALLOW_ARCIGY_LOAD_TEST = "true"
$env:LOAD_TEST_TARGET_ENV = "isolated"
$env:LOAD_TEST_BASE_URL = "https://<isolated-load-host>/"
```

Remote targets also require:

```powershell
$env:ALLOW_REMOTE_LOAD_TEST = "true"
```

Do not set these for the current develop environment until its database/schema, object prefix, and file storage are proven isolated from production. Localhost is not automatically safe because it may use the online PostgreSQL tunnel.

## Scenarios

- `health`: `/health` and `/ready`; no login.
- `project-list`: login once per virtual user, then session and project list.
- `project-open`: login once, then load one approved synthetic project.
- `catalog`: login once, then load catalog and modules; intentionally measures the large tenant path.

Authenticated scenarios require credentials held only in environment variables:

```powershell
$env:ARCIGY_LOAD_TEST_USERNAME = "<isolated-test-user>"
$env:ARCIGY_LOAD_TEST_PASSWORD = "<secret>"
```

`project-open` additionally requires an approved synthetic project:

```powershell
$env:ARCIGY_LOAD_TEST_PROJECT_ID = "<synthetic-project-id>"
```

## Workload controls

```powershell
$env:LOAD_TEST_SCENARIO = "project-open"
$env:LOAD_TEST_CONCURRENCY = "100"
$env:LOAD_TEST_DURATION_SECONDS = "300"
$env:LOAD_TEST_RAMP_SECONDS = "120"
$env:LOAD_TEST_THINK_TIME_MS = "250"
$env:LOAD_TEST_P95_THRESHOLD_MS = "2000"
$env:LOAD_TEST_ERROR_RATE_THRESHOLD = "0.01"
npm run test:saas-load
```

The command returns non-zero when p95 or error-rate thresholds fail. Output contains aggregate and per-normalized-route request/status/latency/decoded-response-byte data so catalog bootstrap, modules, login, list, and project-load cost can be separated. Node fetch transparently decompresses gzip, so these byte counts are the JSON/body size after content decoding, not on-wire transfer bytes. It does not print credentials, project IDs, response payloads, or customer labels.

## Isolated local baseline 2026-07-16

A Windows local-development baseline ran only after `/ready` proved `storage=file`, with `APP_ENV=dev`, `DATABASE_SCHEMA=dev`, object prefix `dev`, every PostgreSQL connection variable removed, the built-in synthetic user, and a read-only QA project. This measured the Vite proxy plus development worker and local file repositories; it is not production, PostgreSQL, CapRover, browser cold-open, or 1,000-user evidence.

| Scenario | Concurrency | Requests | Errors | Req/s | p95 | Peak working set |
|---|---:|---:|---:|---:|---:|---:|
| health | 1 | 92 | 0 | 18.3 | 4.1 ms | 802 MB |
| health | 10 | 2,664 | 0 | 265.8 | 10.6 ms | 532 MB |
| health | 25 | 5,190 | 0 | 515.4 | 22.6 ms | 623 MB |
| project-list | 1 | 19 | 0 | 3.6 | 363.5 ms | 654 MB |
| project-list | 5 | 145 | 0 | 13.7 | 437.2 ms | 683 MB |
| project-open | 1 | 11 | 0 | 2.1 | 63.1 ms | 682 MB |
| project-open | 5 | 91 | 0 | 8.8 | 36.2 ms | 683 MB |
| catalog | 1 | 7 | 0 | 0.79 | 1,832.0 ms | 1,277 MB |
| catalog | 2 | 12 | 0 | 1.06 | 3,493.7 ms | 1,798 MB |

The dominant local resource path is catalog loading: moving from one to two concurrent catalog users increased peak working set by about 521 MB and p95 by about 1.66 seconds, while five concurrent read-only project opens stayed below 66 ms p99. Treat memory figures as process-tree observations for this machine, not a server sizing promise. The next isolated rerun must use the per-route byte metrics to split `/api/catalog/bootstrap` from `/api/modules`, then repeat on production-like PostgreSQL/CapRover infrastructure before any scale claim.

The per-route rerun separated that path. At concurrency 1, three bootstrap responses totalled 91.236 MB decoded, about 30.412 MB each, with p95 2,560.7 ms. Three module responses totalled 12.904 MB decoded, about 4.301 MB each, with p95 129.2 ms. At concurrency 2, four bootstrap responses retained the same per-response size and reached p95 3,385.4 ms, while four module responses stayed at p95 168.0 ms. There were zero HTTP failures. This confirms the browser catalog bootstrap is the dominant remaining cold-load payload and CPU/memory path. It does not authorize dropping tags, preview data, prices, inactive historical records, or any other catalog field without a preservation contract and explicit approval.

### Revision-safe compressed response reuse

The worker now keeps an eight-entry, 64 MiB maximum LRU of already-gzipped browser bootstrap responses. A key contains the authenticated tenant and the exact authoritative catalog revision; every request still authenticates and reads the current revision before reuse. Concurrent cold requests for the same tenant/revision share one catalog read, projection, serialization, and gzip operation. A revision change is a cache miss, entries are process-local and disposable, and the response remains `Cache-Control: no-store`. No JSON field, item, order, endpoint contract, browser revision check, save assembly, or full catalog API changed.

A fresh rerun used the same isolated Windows Vite proxy and file-storage safety proof as the baseline, started with an empty worker cache, and held concurrency at two for ten seconds. All 110 requests succeeded. The 54 bootstrap responses retained the same roughly 30.412 MB decoded payload; p95 fell from the earlier 3,385.4 ms to 164.9 ms, while p99/max remained 2,174.0 ms because the first two simultaneous cold callers waited for the single initial build. Aggregate throughput reached 10.84 requests/second and module p95 was 180.7 ms. The post-run worker/Vite working sets were 196.1/133.4 MB, but those are point-in-time observations, not peak-memory or production-sizing evidence.

This removes repeated server-side catalog reading, projection, serialization, gzip CPU, and the same-tenant cache stampede. It does not make the first tenant cold build cheap, reduce the 30.4 MB decoded browser parse/allocation cost, provide cross-replica cache sharing, or prove PostgreSQL/CapRover/1,000-user capacity. Project-aware or on-demand catalog partitioning remains the preservation-safe next frontend step; fields must not be removed to obtain it.

The same mechanism now also owns the complete `/api/modules` list without changing imports, detail routes, presets, package order, or package contents. Its separate `module-packages-v1` cache is limited to 16 entries and 32 MiB compressed, and keys the authenticated tenant plus exact package count/update/storage revision. Import or preset writes therefore invalidate reuse through the repository revision without a process-local invalidation message.

A second fresh Vite/file-storage run started with both response caches empty and completed 222/222 requests at concurrency two. Aggregate throughput reached 22.08 requests/second. The 110 unchanged module responses retained roughly 4.301 MB decoded each and improved from the preceding 180.7 ms p95 to 40.0 ms; the 110 unchanged catalog responses reached 135.9 ms p95, with the first cold build at 1,904.7 ms max. This is another local repeated-response result, not a claim that first-open browser parsing or production capacity is solved.

### Production-build browser workspace open

`npm run test:workspace-cold-open` is a loopback-only Playwright harness. It refuses to run unless `ALLOW_ARCIGY_BROWSER_PERF=true`; it logs in to an isolated runtime, starts a blank workspace from Project Manager, and emits timings and aggregate transfer sizes only. It never accepts a public target and never prints project, catalog, customer, or credential values.

The 2026-07-16 production-build/file-storage measurement confirms that the Vite-development demo fallback must not be used as evidence for this path: it constructs the local catalog rather than calling the browser bootstrap APIs. With the same full endpoint contracts through the production static worker, the first blank workspace opened in 2.721 seconds. `/api/catalog/bootstrap` began 36 ms after the click, lasted 2.318 seconds, and transferred 1.324 MB compressed / 31.889 MB decoded; `/api/modules` took 294 ms and transferred 0.233 MB compressed / 4.510 MB decoded. A second fresh browser after Project Manager prefetch opened in 434 ms; catalog/modules had started 13–14 ms before the click and the remaining main-thread long task was 140 ms. Both runs had zero console errors. This isolates the remaining cold-open bottleneck to the first complete catalog transfer/decode; it does not justify removing catalog data or changing editor, pricing, BOM, module, save, or export contracts.

## Approved progression toward 1,000 users

Run each level only after the previous level meets thresholds and resources recover:

1. smoke: 1 user, 1 minute;
2. baseline: 10 users, 5 minutes;
3. ramp: 25, 50, 100, 250, 500, then 1,000 concurrent users;
4. peak: expected maximum for 15 minutes;
5. spike: rapid increase to twice expected peak, capped by approved infrastructure;
6. stress: increase until the first declared resource saturates, then stop;
7. soak: expected peak for 4–8 hours;
8. controlled failure: one replica/dependency at a time with an approved recovery plan.

## Evidence to capture

- harness JSON result and exact non-secret configuration;
- app request rate, p50/p95/p99, errors, in-flight requests, restarts, CPU, memory;
- PostgreSQL connections, locks, slow queries, CPU, memory, disk/WAL;
- host disk/network and external dependency latency/errors;
- browser cold/warm project-open time for representative projects;
- first saturated resource, recovery time, and whether SLO/error budget passed.

Do not claim 1,000-user readiness until the full approved isolated run passes and the bottleneck/recovery evidence is stored.
