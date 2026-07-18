# Arcigy SaaS implementation plan — remaining work

Date: 2026-07-18  
Source: supplied 25-area SaaS research and the current readiness audit.  
Rule: preserve all project, editor, module, catalog, pricing, BOM, export, render, tenant and historical-project behaviour. No catalog field or feature is approved for removal.

## Current completed base

- Develop is isolated from production (`dev` database schema/object prefix/persistent storage) while using the approved current-project snapshot for compatibility testing.
- Existing projects list and open live; the representative `Website` project opens with two walls and seven modules.
- Static Vite files are precompressed; the expensive rendering asset now reaches develop with gzip and immutable caching.
- Project-start failures propagate back to Project Manager instead of silently leaving the user waiting.
- The missing default organization avatar now falls back to initials without changing real user photos.
- CI, CodeQL, full UI/accessibility suite, restore drill, production build, secret/dependency gates and the latest isolated develop health smoke are green.
- A real encrypted production backup and isolated restore have been proved; production itself has not been changed.

## P0 — release blockers

### 1. Production durable mount and readiness release

**Why:** production must have an explicit persistent `/app/storage` mount before the next release, and `/ready` must return PostgreSQL JSON after deployment.

**Implementation:** configure an initially empty durable volume only for the production app, deploy the approved `main` release through the protected workflow, then prove `/health`, `/ready`, project open/save/reopen, persistence across one controlled redeploy, and rollback to the prior image.

**Required authority:** explicit production deployment approval. This is intentionally not automatic.

**Rollback:** select the pre-deploy image in CapRover; do not delete the new volume or customer data during rollback.

### 2. Historical Google API-key disposition

**Why:** three historical GitHub secret-scanning alerts are not resolved until the owning Google Cloud account proves each key revoked or rotated.

**Implementation:** inventory only key metadata in the owning Google Cloud account, rotate an active consumer first if necessary, revoke the old key, verify the affected assistant/editor flow, and resolve each GitHub alert with provider-side evidence.

**Required authority:** authenticated owner access to the Google Cloud project and approval to revoke/rotate credentials.

## P1 — next engineering slices

### 3. Production-like capacity baseline

Create a separately isolated PostgreSQL/CapRover load target with representative tenant/catalog/project data and host/DB telemetry. Run the existing fail-closed harness in this order: health smoke, authenticated project-list/open/catalog baseline, ramp, peak, spike, stress, soak and controlled recovery. Capture p50/p95/p99, error rate, decoded/on-wire bytes, CPU, memory, pool waits, locks, database I/O and recovery time. Do not load-test production.

### 4. Compatibility-safe catalog loading

The complete tenant catalog is the measured first-open bottleneck. Introduce versioned summaries/detail partitions only after characterization proves every module, material, price, BOM, export, save/reopen and historical project receives the same authoritative values when needed. Keep the existing full bootstrap as a compatibility fallback until real tenant/browser comparison passes. Do not delete inactive data, preview fields, prices or historical records to obtain performance.

### 5. Database isolation defence in depth

Design a dry-run PostgreSQL RLS and least-privilege-role migration. It must set tenant context per transaction, cover pool reuse, preserve migrations/administration, and include parallel cross-tenant negative tests. Use expand–migrate–contract; production activation is a separately approved migration.

### 6. Durable long-work queue

Add an additive PostgreSQL-backed job model for long Blender render/export and non-interactive assistant/supplier work: tenant/project scope, idempotency key, lease, bounded retry/backoff, cancellation, dead-letter state, output ownership and status endpoint. Keep the current synchronous interactive assistant response until the replacement UX is characterized. Migrate one operation at a time with full project/export regression and rollback.

### 7. Central observability and actionable alerts

Connect existing low-cardinality HTTP, browser journey, runtime-category, cache and readiness metrics to a protected central collector. Add dashboards for application, PostgreSQL, host, backups and external services; then exercise alerts for readiness failure, elevated 5xx, project-open latency, backup age and disk pressure. Never put user, tenant, project, URL, message, stack or token values in metric labels.

### 8. SLOs, incident drills and FinOps

Approve measurable SLO/error-budget values from the capacity baseline. Exercise the documented DB saturation, disk-full, external provider, bad deploy, credential and restore runbooks. Add cost and usage observations per safe aggregate (tenant/tier only where privacy and cardinality allow), budget/anomaly alerts and storage/log retention controls.

### 9. Privacy and accessibility completion

Obtain legal/business approval for the data inventory, retention and subprocessor register. Implement and exercise tenant/user export, deletion/anonymization and backup-aging policy. Perform manual keyboard, screen-reader, contrast and 200% zoom/reflow acceptance in addition to the existing automated checks.

## P2 — only when growth evidence requires it

- multiple replicas, autoscaling caps and a shared coordinator/gateway;
- queue fairness and higher-scale worker topology;
- 1,000-user repeated peak/spike/soak proof;
- database failover/replica/read-model work;
- advanced cost allocation and independent security/accessibility review.

## Execution rules for every slice

1. Record the current user journey and persisted-output baseline.
2. Make one additive, reversible change in a dedicated branch.
3. Add focused regression/negative tests and a non-programmer manual test entry.
4. Run typecheck, full tests, build, project roundtrip and UI regression; then verify live develop where appropriate.
5. Compare project open/edit/save/reopen, catalog/module availability, pricing/BOM/export outputs and tenant isolation against the baseline.
6. Deploy to production only with explicit approval, preflight, verification and rollback evidence.

## Function-removal decision

**None.** The large initial catalog is expensive, but its modules, materials, prices, inactive historical references and customer-specific rules are product data. The approved direction is compatible loading/caching, not removing functionality.
