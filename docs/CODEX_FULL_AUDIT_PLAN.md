# Arcigy full application audit and hardening plan

Status: active. This is a living evidence plan for the full-audit program requested on 2026-08-23. It records what can be proved from the repository and authorized local/develop environments. It does not treat a passing test, scanner, or document as proof of an unverified live control.

## Architecture and application inventory

Arcigy is a TypeScript modular-monolith kitchen-design SaaS. The browser application uses Vite, Three.js, and DOM-based UI controllers. A Node HTTP worker provides REST-style authenticated APIs. `src/server/workerRequestPipeline.ts` owns common request security, request IDs, metrics, origin checks, readiness, budgets, and public error mapping; `src/server/workerApiRouter.ts` dispatches domain APIs. The two worker entrypoints retain only runtime-specific composition.

Authoritative production data is PostgreSQL plus tenant-scoped durable storage/object prefixes. File repositories are allowed only for isolated local/test work. Signed HttpOnly browser cookies carry opaque sessions that are revalidated against users and the durable session store. Roles are owner, designer, and viewer; tenant scope comes from the authenticated server context, never a browser-supplied client ID.

Primary critical workflows are login/logout/session revocation; project create/open/edit/save/version/restore/import/export; catalog and module browsing/import/presets; pricing/BOM and customer outputs; Blender/render export; Supplier Bridge; assistant/RAG; feedback delivery; and deployment/restore. Customer-specific catalogs, pricing, geometry, historic projects, and outputs are preservation invariants.

Known external boundaries are CapRover/nginx, PostgreSQL, durable/object storage, Blender/desktop subprocesses, Odoo feedback, Demos/supplier lookup, Google Gemini when configured, GitHub/CI, and backup storage. No product payment flow, card processing, registration/reset email flow, general webhook receiver, OAuth/SSO, GraphQL, SMS, or general-purpose queue was identified in the initial graph-assisted inventory; this must be rechecked during route and dependency review.

## Trust boundaries and high-value assets

| Boundary or asset | Required invariant | Initial evidence |
| --- | --- | --- |
| Browser/extension to API | Browser data is untrusted; auth, role, tenant, ownership, prices, and storage keys are server-established | `docs/SECURITY.md`; worker request pipeline and API router |
| Tenant data | A tenant cannot read, mutate, enumerate, export, cache, or open another tenant's projects, catalogs, modules, assets, RAG, or outputs | Tenant-scoped repositories, storage resolver, negative tests; PostgreSQL RLS still needs live implementation evidence |
| Authentication | Cookie is Secure/HttpOnly/SameSite in production; session has expiry, revocation, user/role/tenant revalidation, generic failures, and abuse protection | Auth/session contracts and regression suite |
| Files and subprocesses | Imports/uploads are bounded and validated; Blender paths stay under the real tenant root; production never opens desktop output | FQP, feedback, storage, and Blender output tests |
| External calls | Exact destinations, bounded response, timeout, safe failure, minimized payload, no implicit redirects | External HTTP helper and integration tests |
| Operations/control plane | Deploy, CI, backup, CapRover, GitHub, credentials, and storage are privileged and auditable | Workflow/runbook/config review; several controls require live operator evidence |

## Audit workstreams and priorities

### P0: block release or require explicit risk acceptance

1. Confirm no current cross-tenant, authentication-bypass, arbitrary file/RCE, unrecoverable-data, or production-outage defect remains. Reproduce safely with synthetic local fixtures and negative tests.
2. Reconcile GitHub secret-scanning alerts. Provider-side revocation/rotation is an external action and must remain open until evidenced; source changes alone cannot close it.
3. Verify durable storage and off-host backup/PITR/restore evidence. Local synthetic restore is a regression gate, not proof of production recovery.

### P1: material security or reliability hardening

1. Complete route-by-route authorization, input, mass-assignment, idempotency, concurrency, external-call, and output review.
2. Verify PostgreSQL tenant defense in depth, least-privilege role, storage/object-prefix isolation, and environment separation without mutating live data.
3. Improve structured logging/redaction, metrics, readiness, error handling, SLO/alert/runbook evidence where repository changes can safely enforce it.
4. Audit CI/CD, Actions versions, branch protection, supply chain, SBOM, dependency scan, secret scan, container image, and deployment/rollback controls.
5. Add tenant A/B, role, malformed-input, failure, and recovery regressions for every confirmed issue.

### P2: quality, privacy, resilience, performance, and documentation

1. Add/update the privacy data map and review, threat model, security report, observability report, incident response, backup/restore, architecture inventory, and final report.
2. Add safe parser/property/fuzz and failure coverage where complex formats or validators warrant it.
3. Measure representative local cold/warm flows, request bounds, bundle behavior, and CPU/memory evidence without removing customer behavior or load-testing shared infrastructure.
4. Review accessibility, mobile/responsive, browser, API contract, code-quality, dead-code, and type-safety gaps proportionate to impact.

## Preservation gate

The following journeys are `preserved` unless explicitly labelled otherwise: project create/list/open/edit/save/version/restore/close/reopen/import/export; walls, rooms, dimensions, selection, move, align, snap, delete, undo/redo, 2D/3D navigation; module geometry/materials/hardware; catalog fidelity; pricing/BOM/output totals; tenant ownership; and existing error/recovery semantics. No record deletion, live migration, production credential/routing change, destructive cleanup, or feature removal is in scope without separate founder approval.

Every implementation slice must name its owner, affected journey, regression test, non-programmer test path, rollback, and one of `preserved`, `intentionally extended`, or `approval required`.

## Verification strategy

1. Establish current baseline: clean isolated worktree, `npm ci`, typecheck, unit/integration suite, build, UI regression, project full roundtrip, browser console, dependency/secret scans, and existing CI/deploy evidence.
2. Use Graphify first to locate each owner; then manually inspect exact routes and data flows. Do not infer from UI-only controls.
3. Run safe local dynamic tests using synthetic tenant/role fixtures. Never use production data, real customer accounts, destructive scans, unapproved load, or third-party attacks.
4. For each finding: record severity, reproduction, root cause, fix, regression, residual risk, verification, and rollback in `docs/security-report.md`.
5. Update the graph after code changes, run focused checks per slice, then full required checks before publication.
6. Before delivery, reconcile every item in the Definition of Done below against current evidence; `missing`, `partial`, and `decision required` are not completion.

## Dependencies and authority boundaries

- Provider credential revocation, GitHub branch/ruleset changes, external monitoring backend, backup/PITR configuration, production database roles/RLS, storage migration, live data deletion/migration, production routing, and release to `main` require operator/founder authority.
- Repository code, tests, CI checks, non-secret documentation, isolated development behavior, and PR delivery to `develop` are in scope once verified.
- A blocked external item remains visible in the final report and does not get silently converted into a code-only claim.

## Definition of Done matrix

| Requirement | Evidence required | Initial state |
| --- | --- | --- |
| Install, start, build, typecheck, lint, unit/integration/E2E | Current command output and CI on the final commit | pending re-baseline |
| Critical workflows and preservation | Browser/UI and project roundtrip evidence, zero new console errors | pending re-baseline |
| Authentication, authorization, tenant A/B | Focused negative tests and route review | partial; expand matrix |
| Secrets, dependency scan, SAST | Current scan output, GitHub alert state, reviewed findings | partial; provider rotation remains external |
| PII/privacy/payment review | Data map, review, routes/integrations evidence | partial; no payment flow initially identified |
| Observability/alerts/SLO | Code/config plus live backend/alert evidence where available | partial; central backend requires decision/authority |
| Backup/restore/durability | Synthetic restore plus approved off-host/PITR evidence | partial; production evidence outstanding |
| Incident/operations/runbooks | Current, actionable documents and an exercised safe path | partial |
| CI/CD/deploy/rollback | Green PR and deploy plus branch/ruleset evidence | partial; control-plane findings require operator action |
| Final report | Requirement-by-requirement evidence and named residuals | pending |

## Delivery sequence

1. Inventory and baseline.
2. P0/P1 attack-surface verification and narrowly scoped fixes with regression tests.
3. P2 documentation and resilience/quality improvements.
4. Full final verification, evidence reconciliation, focused commits, protected PR to `develop`, CI, merge, deployment health/readiness, and online founder test path.
