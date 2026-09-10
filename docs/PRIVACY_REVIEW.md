# Privacy and retention review

This engineering review complements `PRIVACY_AND_RETENTION.md`. It does not
replace a controller's legal basis, data-processing agreement or formal GDPR
assessment.

## Data map

| Category | Examples | Processing location | Current engineering controls | Required decision |
| --- | --- | --- | --- | --- |
| Account and tenant identity | Company, user, role, session metadata | Worker/database | Authenticated context and role checks; no password logging | Legal basis, retention after account closure |
| Project/customer data | Project names, addresses, contacts, dimensions, pricing, BOM | Browser, worker, storage/database | Tenant-scoped route ownership; FQP integrity limits | Retention period and export/delete procedure |
| Files and generated outputs | FQP, attached assets, render/export outputs | Tenant storage and browser download | Path and tenant checks; archive limits | Object-storage lifecycle and deletion proof |
| Assistant data | Prompts, selected project context, tool requests | Worker and configured model provider | Tool validation, authorization and bounded telemetry | Provider DPA, processing region, prompt retention |
| Supplier/Odoo/feedback data | Supplier configuration, validated feedback PNG and operation metadata | Worker / configured integration | Input validation and safe errors | Contract, recipient list and retention |
| Operations data | Request IDs, audit events, health/metrics | Worker and future observability backend | Pseudonymous references; structured logging | Retention, access control and export policy |
| Per-user app activity | Exact tenant/user ID, current active/idle/offline state, intervals and daily active seconds | PostgreSQL and approved Odoo integration | Default-off exact-tenant allowlist, authenticated server identity, multi-tab dedupe, bounded gap, strict no-content payload, restricted Odoo groups | Lawful basis, worker/employee notice, DPIA decision, retention, subject export/deletion and Odoo recipient/DPA approval before production |

## Engineering findings

- The repository avoids storing secrets and raw project payloads in routine
  mutation audit logs.
- Tenant scoping is implemented at route/repository boundaries, but the
  database layer still requires independent RLS and grant verification.
- No complete subject-access export, erasure workflow, or automated retention
  job is proven in this repository. These must be designed with product and
  legal owners before claiming GDPR operational completeness.
- Any external assistant, analytics or alerting provider must be added to the
  processor inventory before live enablement.
- Per-user activity is implemented but remains disabled. Engineering totals
  mean foreground Arcigy app-active time only and must not be used as a payroll,
  attendance or productivity claim without a separately approved policy and
  validated methodology.

## Minimum production checklist

1. Name controller, processor and DPO/contact; publish legal basis and privacy
   notice.
2. Set retention windows by data category and implement deletion scheduling.
3. Provide authenticated tenant export and deletion request workflows with an
   auditable operator review path.
4. Encrypt backups and restrict restoration access; test deletion propagation
   to backups according to the approved policy.
5. Select observability retention and redaction rules before exporting logs.
