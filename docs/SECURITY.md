# Arcigy security model

This document defines the engineering security contract for Arcigy. It is not a claim of certification and does not replace a professional penetration test or legal review.

## Protected assets

- tenant identity, users, roles, sessions, password hashes, and supplier bridge tokens;
- project contacts, addresses, designs, versions, previews, exports, renders, pricing, and BOM;
- customer-specific catalogs, modules, materials, supplier prices, mappings, and business rules;
- production database, application storage, backups, credentials, source, release artifacts, and operational logs.

## Trust boundaries

1. Browser and extension input is untrusted. Tenant, role, price, file path, and object ownership must be established server-side.
2. The API is the authorization boundary. Every tenant-owned repository query and storage key must include the authenticated tenant scope.
3. PostgreSQL and durable object storage are authoritative. Process memory, browser state, local caches, metrics, and logs are not sources of truth.
4. Every assistant RAG cache and fallback is tenant-scoped. A database outage may use only the authenticated tenant's bounded transient index or rebuild from current server sources and that tenant's supplied catalog; it must never reuse another tenant's last index. Invalid database environment/schema configuration is not an outage fallback and must fail closed.
5. Gemini, supplier portals, Demos lookup, and any future webhook are external systems. Requests require exact destination constraints, timeouts, size bounds, safe errors, and minimum data disclosure.
6. Blender and file-opening subprocesses cross an OS boundary. Paths, extensions, timeouts, output location, and tenant ownership must be validated before execution.
7. CapRover, CI, GitHub, backup storage, and operator access are privileged control planes. Use least privilege, separate environments, auditable changes, and human approval for destructive actions.

## Security invariants

- Never accept `clientId`, role, permission, authoritative price, or storage namespace from the browser.
- Every tenant-owned database key, cache key, storage path, job, audit record, and export must preserve tenant ownership.
- Never log request payloads, credentials, bearer tokens, cookies, raw customer identifiers, project content, or secret values.
- Never make an external HTTP request without destination validation, timeout, redirect policy, and response-size limit.
- Never parse an unbounded request or upload.
- Never persist or log a raw idempotency key; scope its hash by tenant and operation, and reject reuse with a different request fingerprint.
- Never replace a tenant's persisted assistant RAG index with delete-then-insert writes outside one database transaction; rollback must preserve the previous complete index after any failed replacement.
- Never remove historical catalog data merely for performance; existing projects may reference inactive records.
- Never run load, destructive, restore, or migration tests against shared production data.
- Never deploy a schema-dependent release before its backward-compatible migration succeeds.
- Never remove or degrade a product feature as a security/performance shortcut without explicit user approval.

## Current controls

| Threat | Current control | Remaining work |
|---|---|---|
| Cross-tenant object access | Signed session, live user/tenant/role revalidation, tenant-scoped repositories, composite keys, storage path validation, negative tests | PostgreSQL RLS and least-privilege runtime role |
| Session theft or stale access | HttpOnly, Secure production cookie, SameSite=Lax, expiry, durable PostgreSQL-backed revocation for new logins, active user/role/tenant revalidation | Re-authentication/MFA for sensitive actions; legacy pre-rollout cookies age out within their existing seven-day expiry |
| Login abuse | Generic errors, IP+username failed-attempt limiter with bounded memory | Trusted shared/distributed limiter and alerting |
| CSRF, XSS, clickjacking, and foreign origins | Unsafe cookie-authenticated methods validate Origin/Sec-Fetch-Site; token bridge remains separate; enforced CSP limits scripts to same-origin, blocks objects and framing, and `X-Frame-Options: DENY` provides legacy clickjacking defense | Nonce-based styles if the current inline-style product surface is later removed; independent penetration review |
| Oversized requests | Route-aware JSON limits, early `Content-Length` rejection, streamed overflow rejection, HTTP 413 | Explicit response limits/pagination for every growing list |
| SSRF/external dependency abuse | Exact host rules, timeouts, size caps, redirect denial, content-type checks | Central egress policy and dependency SLOs |
| Resource exhaustion | Tenant/peer request budgets for expensive routes, DB/pool timeouts, Blender timeout | Shared gateway limits, durable queue, per-tenant quotas |
| Path traversal/subprocess abuse | Sanitized tenant paths, storage-root containment, allowed Blender output extensions | Sandbox/worker isolation before broader file formats |
| Sensitive logs/metric cardinality | Request IDs, normalized metric routes, no tenant/project labels, HMAC mutation references | Central encrypted retention and access policy |
| Data loss | Transactional migrations and persistent PostgreSQL volume | Off-host encrypted backup, PITR, durable app files, tested restore |
| Supply chain | Lockfile, CI install/build/test, a fail-closed production dependency policy that blocks every high/critical advisory, official SheetJS 0.20.3 with retained Excel export compatibility, no-dependency tracked/untracked text secret scan with value-safe findings, GitHub provider secret scanning and push protection, official actions pinned to verified full commit SHAs, local CodeQL init/analyze gate for JavaScript/TypeScript, CI-generated CycloneDX production SBOM artifact, bounded weekly Dependabot version-update PRs for npm and GitHub Actions targeting `develop` without auto-merge, and a PR-only dependency review gate for newly introduced high/critical vulnerabilities across all dependency scopes | Revoke three unresolved historical Google API keys, enable or prove the GitHub dependency graph prerequisite, publish and review the first CodeQL/SBOM/Dependabot/dependency-review runs, close alerts as revoked, enable validity checks after approval, signed build provenance |

## Mutation audit contract

`mutation_audit` events contain only timestamp, request ID, static action, source type, status/outcome, role, and HMAC references. They never include URLs with query data, request/response bodies, names, emails, tokens, cookies, or raw tenant/user/project/session IDs.

Production should set a separate `ARCIGY_AUDIT_HASH_SECRET`. If absent, the logger falls back to `AUTH_SESSION_SECRET`; secret rotation changes future references and must be recorded operationally. Audit logs are evidence, not authorization and not a durable audit store until centralized retention is configured.

## Session lifecycle contract

Every new login creates an opaque session ID and a hash-bound row in `arcigy_auth_sessions`. The signed cookie remains the bearer credential; API authorization additionally requires the matching unexpired, unrevoked database row. Logout revokes that row before clearing the browser cookie. The session ID is not returned in JSON responses.

Signed cookies created before this control have no session ID. They remain accepted only through their already-signed maximum seven-day expiry so a deployment does not unexpectedly sign out every active user. Releasing this change starts that bounded compatibility window; rotating `AUTH_SESSION_SECRET` would end it immediately and therefore requires explicit release approval.

## Security review triggers

Require a focused threat-model update and negative tests when changing authentication, roles, tenant keys, project/storage ownership, external fetches, uploads, subprocesses, supplier tokens, backups, migrations, billing, webhooks, logging, or deployment topology.

Suspected tenant exposure, credential disclosure, or data corruption is `SEV-0`. Follow `docs/SAAS_OPERATIONS_RUNBOOK.md`; stop deploys and affected writes, preserve request-ID evidence, and do not copy customer payloads into tickets or chat.
