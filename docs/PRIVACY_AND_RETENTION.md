# Arcigy privacy and retention engineering baseline

Status: engineering inventory and proposed controls. Legal basis, controller/processor roles, contractual text, retention periods, subprocessors, DPIA need, and data-subject procedures require business/legal approval before this can be called GDPR-complete.

## Data inventory

| Category | Examples in the current model | Primary storage/flow | Current retention state |
|---|---|---|---|
| Organization and users | company/legal name, business/VAT IDs, workshop address, names, email, phone, role, permissions, username, password hash, active state | PostgreSQL organization/user/auth tables and tenant profile | No approved retention/deletion schedule |
| Authentication | signed browser cookie with opaque session ID; hashed server session and Supplier Bridge tokens | Browser cookie, PostgreSQL `arcigy_auth_sessions`, extension local storage for bridge progress/secrets | New logins are revocable and expire; legacy pre-rollout cookies age out within seven days; automated expired-session purge and approved retention remain incomplete |
| Project/customer | project name, address, notes, contact name/email/phone/company, design, preview, versions, activity, pricing/BOM | PostgreSQL project metadata/save/version JSON and application files | Project delete exists for owner/admin; organization-wide export/deletion and backup erasure are incomplete |
| Catalog and commercial | tenant materials, modules, prices, hardware, vendor mappings, inactive historical references | PostgreSQL catalog/module/supplier tables | Retain while referenced; no blind inactive-record deletion |
| Supplier observations | product codes, normalized product data, availability, account reference, observed price/unit/source path | PostgreSQL Supplier Bridge tables; normalized data from browser extension | No approved observation retention period |
| Assistant | user message, live editor context, conversation/tool results, tenant catalog/RAG excerpts | Sent per request to Gemini only when configured; tenant RAG may persist in PostgreSQL | Conversation retention in app is not formally defined; third-party retention requires contract review |
| Generated files | project exports, previews, renders, uploads, backups | `/app/storage` today; target durable tenant-scoped volume/object storage | Lifecycle and deletion policy pending durable-storage migration |
| Operations | request ID, normalized route metrics, slow request data, HMAC mutation references, status/outcome | process/Docker logs and future central telemetry | Central retention, access controls, and deletion schedule not configured |

## External recipients and subprocessors to confirm

- CapRover hosting/infrastructure provider and backup/object-storage provider;
- Google Gemini when `GEMINI_API_KEY` is configured: assistant message, live context, tools summary, and selected RAG text are sent to the model endpoint;
- Demos material lookup endpoints for bounded product/image retrieval;
- supplier portals used by the browser extension: Demos, Schachermayer, Hranipex, and JAF Holz; normalized product/price observations are returned to Arcigy, not supplier passwords;
- GitHub/CI and any future observability/error-monitoring provider.

The business owner must record contract, region, purpose, data categories, transfer mechanism, retention, deletion, security review, and DPA status for each active provider.

## Minimization rules

- Collect project contact/location fields only when required for quotation/delivery workflow.
- Do not put customer names, contact data, project content, raw identifiers, tokens, or payloads in metrics or operational logs.
- Send the assistant only the minimum live context and RAG excerpts necessary for the request; do not send unrelated projects or tenants.
- Supplier Bridge sends normalized required observations, not whole pages, cookies, or supplier credentials.
- Keep inactive commercial records required by historical projects, but distinguish this compatibility need from personal-data retention.
- Use synthetic data in develop/load tests unless a controlled copy is explicitly approved and protected.

## Required data-subject and tenant procedures

These remain release/accountability work items:

1. authenticate and authorize the requester;
2. locate identity, organization, project, file, supplier, assistant, log, and backup data without cross-tenant exposure;
3. support structured tenant/user export in a portable format in addition to existing project FQP export;
4. support correction, restriction, deletion/anonymization, and documented exceptions;
5. propagate deletion to durable files and processors;
6. define how expired data disappears from backups without corrupting restore integrity;
7. record requester, scope, approvals, timestamps, outcome, and residual backup window in the privacy audit trail.

Never directly edit production JSON/SQL to satisfy a request. Use tested tenant-scoped workflows with backup and rollback.

## Proposed retention decisions

The following are proposals, not active policy:

- active tenant/project data: contract lifetime;
- deleted project soft-recovery window: 30 days, then purge, subject to legal/contract needs;
- security/mutation audit: 12 months, access restricted;
- general application logs: 30 days; aggregated low-cardinality metrics: 13 months;
- Supplier Bridge raw observations: 12 months unless needed for an accepted quote/accounting record;
- expired sessions/tokens: purge within 30 days;
- backups: 7 daily, 4 weekly, 6 monthly; deleted data ages out through retention rather than destructive backup editing.

The business/legal owner must accept or replace each period and document lawful basis, contractual/accounting exceptions, and geographic requirements.

## Accessibility acceptance

`npm run test:accessibility` provides an isolated automated baseline for login, Project Manager, and the editor. It checks the primary document language, exactly one visible main landmark, unique IDs, valid ARIA references, names for visible controls and dialogs, image alternatives, labelled canvases, non-positive tabindex ordering, three keyboard focus stops per surface, and unexpected browser errors.

This is not a WCAG conformance claim. Release acceptance still requires keyboard-only review with visible focus, a representative screen-reader flow, foreground/background contrast measurement, 200% zoom and reflow review, error-state review, and an independent accessibility assessment where contract or law requires it.

## Privacy completion evidence

Privacy is not complete until the approved data map, legal roles/bases, DPA/subprocessor register, retention schedule, tenant/user export, deletion/anonymization, backup erasure model, breach workflow, access audit, and an exercised request are evidenced.
