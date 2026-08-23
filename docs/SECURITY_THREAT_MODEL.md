# Arcigy security threat model

Status: reviewed 2026-08-23. This document describes the current repository
implementation and its verified controls; it is not a claim that external
operational controls have been enabled.

## Assets and trust boundaries

| Asset | Trust boundary | Primary controls | Evidence |
| --- | --- | --- | --- |
| Tenant identity, role and session | Browser / worker API | Authenticated `ClientContext`, role checks and trusted-origin policy | `src/server/workerServer.ts`, endpoint regression tests |
| Projects, materials, margins and supplier assignments | Tenant-scoped API / storage | Context-derived client identifier; resource handlers reject foreign client data | `src/server/projectEndpoint.ts`, `src/server/projectMaterialsEndpoint.ts`, `src/server/projectMarginsEndpoint.ts` |
| Catalog and module packages | Tenant-scoped repositories | Client repository created from the authenticated context; validated module package input | `src/core/catalog`, `src/core/module-package` |
| Assistant requests and tools | Browser / worker / external model | Tool allowlist, schema validation, authorization client and bounded orchestration | `src/assistant/toolRegistry.ts`, `src/assistant/toolValidation.ts` |
| Feedback and Odoo integration | Worker / configured external endpoint | Server-side validation, constrained request handling and safe error treatment | `src/server/feedbackReportEndpoint.ts` |
| FQP project files and bundled assets | Untrusted uploaded file / application parser | Authenticated import, cryptographic checks and decompression limits | FQP unit and UI round-trip tests |
| Blender output | Worker / local process / filesystem | Tenant and path boundary checks; online desktop-open action unavailable | Blender route tests |
| Deploy credentials and runtime | GitHub environment / CapRover | Environment-scoped secrets, preflight target verification, readiness check, non-root runtime | `.github/workflows/deploy-caprover.yml`, `Dockerfile`, preflight tests |

## Adversaries and principal abuse cases

1. An unauthenticated internet client probes API and static endpoints.
2. A normal tenant user attempts horizontal or vertical privilege escalation.
3. A compromised browser sends forged IDs, oversized payloads or malformed FQP
   archives.
4. A malicious assistant prompt attempts tool invocation outside its scope.
5. A compromised CI or deployment credential attempts to alter the wrong
   CapRover target or remove rollback artifacts.
6. A dependency, secret or supply-chain compromise reaches a build or runtime.

## Implemented mitigations

- Authentication and authorization are checked at worker boundaries; client IDs
  are derived from authenticated context rather than supplied as a trusted
  request field.
- Viewer permissions are read-only. Regression coverage protects project,
  catalog and destructive mutation behavior.
- The request pipeline adds request IDs, security headers, bounded request
  parsing and structured mutation-audit events without raw project payloads.
- FQP parsing validates integrity and applies archive/decompression limits.
- Deployment preflight rejects an unknown or cross-wired CapRover target,
  requires durable storage evidence and checks the selected origin's health and
  readiness after deploy.
- The deployment workflow performs only a read-only unused-image inventory
  inspection. It contains no CapRover `deleteImages` call.
- CI runs typechecking, tests, build, UI regression, dependency policy, tracked
  secret scanning, CodeQL, SBOM generation and an isolated PostgreSQL restore
  drill.

## Residual risks and required decisions

| Priority | Risk | Required owner action |
| --- | --- | --- |
| P1 | Historical GitHub secret alerts cannot be closed by source changes. | Revoke/rotate the affected provider credentials, invalidate old keys and close alerts with evidence. |
| Closed 2026-08-23 | `develop` protection allowed administrator bypass (`enforce_admins=false`). | Repository protection was updated to enforce administrators; `verify` and `CodeQL` remain strict required checks, with force pushes and deletions disabled. |
| P1 | Database RLS and least-privilege grants need live schema verification. | Database operator must provide a non-production schema snapshot or run the documented role/RLS verification. |
| P1 | Off-host backups, PITR and a timed restore have no repository-verifiable proof. | Operations must configure and exercise encrypted off-host backup/PITR, then record RPO/RTO evidence. |
| P1 | Centralized log/metric/trace retention and alert delivery are not proven. | Select a provider, configure redaction/retention/access control and test a real alert. |
| P2 | Shared distributed rate limiting and MFA/SSO depend on approved identity and cache services. | Product/operations decision and staged implementation. |
| P2 | Production CSP still permits narrowly scoped compatibility allowances. | Remove only after browser compatibility characterization. |

## Required regression scenarios

- Tenant A cannot read, update, delete or attach data to Tenant B resources.
- Viewer cannot create, import, mutate or export privileged resources.
- Auth failures, malformed body, forged IDs, expired session and wrong origin
  fail without sensitive information.
- FQP corruption, signature failure and decompression pressure fail before data
  is persisted.
- Assistant, feedback, supplier and Blender routes reject out-of-scope input.
- Deploy preflight rejects a production namespace when deploying develop, and
  deployment never deletes images automatically.
