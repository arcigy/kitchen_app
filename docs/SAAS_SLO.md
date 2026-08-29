# Arcigy SaaS service-level objectives

Status: proposed measurement contract. Targets become enforceable only after production metrics, alerting, and the first representative 30-day baseline are available.

## Measurement rules

- Measure each environment separately. Never combine develop and production.
- Measure server latency and browser project-open latency separately.
- Exclude validated client errors (`4xx`) from availability, except unexpected `401`, `403`, `409`, `413`, or `429` spikes caused by a release.
- Do not exclude dependency failures, database failures, bad deploys, or capacity exhaustion.
- Do not put tenant, project, user, URL query, or file names in metric labels.
- Use rolling 5-minute alert windows and calendar-month SLO reporting.

## Initial SLOs

| User journey | Service-level indicator | Initial objective |
|---|---|---|
| Core authenticated API | Successful non-4xx requests / eligible requests | 99.9% monthly |
| Project list | p95 server latency for `GET /api/projects` | under 1 second |
| Warm project open | p95 browser time from click to usable editor | under 5 seconds |
| DELFI reference cold open | p95 browser time from click to usable editor | under 15 seconds |
| Project save | successful durable saves and p95 latency | 99.95%; under 2 seconds for reference save |
| Project load integrity | successful validated roundtrips | 100% in release regression; zero silent loss |
| Export/render | successful completion within declared timeout | 99% within 120 seconds until moved to a durable queue |
| Tenant isolation | cross-tenant negative tests and incidents | zero unauthorized reads or writes |
| Restore | isolated restore drill | meet approved RPO/RTO; currently a P0 decision |

## Error budgets

- 99.9% monthly availability allows approximately 43.8 minutes of unavailability in a 30-day month.
- Consume the error budget for failed eligible requests and unavailable core journeys, not planned maintenance that was explicitly communicated and measured separately.
- Freeze risky feature deployment when 50% of the monthly budget is consumed before mid-month.
- Freeze non-remediation deployment when the full budget is consumed. Resume only after the failing indicator is stable and the incident follow-up is recorded.
- Tenant exposure or silent project/pricing corruption bypasses the normal budget and is always a release stop.

## Metrics and dashboards

The worker exposes Prometheus text metrics at `GET /metrics`:

- `arcigy_http_requests_total`
- `arcigy_http_request_duration_seconds`
- `arcigy_http_requests_in_flight`
- `arcigy_process_uptime_seconds`
- `arcigy_browser_journey_total`
- `arcigy_browser_journey_duration_seconds`
- `arcigy_browser_runtime_errors_total`
- `arcigy_browser_long_task_duration_seconds`
- `arcigy_browser_memory_used_bytes`

Production hides the endpoint unless `ARCIGY_METRICS_TOKEN` is configured. Scrapers must send `Authorization: Bearer <token>` over HTTPS. Keep the token out of dashboards, logs, source control, and chat.

The browser metrics distinguish fixed `project_open` source combinations such as `loaded_network` and `loaded_session_cache`, plus separate app-data sources (`local`, `network`, `persistent_cache`, `session_cache`), without customer identifiers. Runtime metrics add only fixed JS-error/rejection counters and numeric long-task/memory distributions. Memory is a best-available per-browser trend sample and must not be treated as directly comparable between different browser engines or versions. Required external dashboard additions:

- HTTP request rate, error rate, p50/p95/p99, and in-flight requests by normalized route;
- `/ready` failures and database readiness latency;
- PostgreSQL connections, pool saturation, slow queries, locks, CPU, memory, storage, WAL, and replication/backup state;
- CapRover host disk, inode, container restart, CPU, and memory;
- browser cold/warm project-open timing, long-task p95/p99, uncaught error rate, and memory trend;
- external Gemini, Démos, Supplier Bridge, Blender, and export success/timeout rate.

## Initial alerts

- Page: core eligible error rate above 5% for 5 minutes.
- Page: `/ready` fails for 3 consecutive probes.
- Page: tenant-isolation signal, restore failure, or suspected data loss.
- Page: host disk above 90%; warn above 80%.
- Warn: route p95 exceeds its SLO for 15 minutes.
- Warn: PostgreSQL connection use above 80% of the approved budget.
- Warn: error-budget burn projects exhaustion within 7 days.
