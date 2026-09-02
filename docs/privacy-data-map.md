# Privacy data map

This is an engineering data map, not legal advice. The controller must approve
retention periods, legal basis, processor agreements and subject-request flow.

| Data | Collected from | Stored in | Purpose | Retention | Encryption | Access | Processor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant identity and role | Login/session service | Auth repository/session store | Authenticate and authorize workspace access | Policy required after account closure | TLS in transit; server-side session protection | Current authenticated tenant and authorized operators | Arcigy infrastructure |
| Project/contact and quote data | Project forms/imports | Tenant-scoped PostgreSQL/storage | Kitchen design, pricing, BOM, export | Business/legal retention decision required | TLS; project-file protections where applicable | Tenant roles, server-scoped repositories | Arcigy infrastructure |
| Uploaded and generated files | Project import, render/export | Tenant-scoped storage | Restore, render and export workflow | Lifecycle/backup policy required | Tenant path checks and transport encryption | Tenant-authorized resource routes | Arcigy infrastructure / approved storage provider |
| Assistant prompts and context | Authenticated assistant API | Worker and configured model request path | Assisted design workflow | Provider and product policy required | TLS; tool validation and authorization | Authorized tenant workflow | Configured AI provider |
| Supplier/Odoo/feedback data | Supplier bridge and feedback form | Worker/integration storage | Material mapping and support feedback | Contract/policy required | Validated inbound data; no secrets in normal logs | Authorized tenant/integration users | Configured supplier/Odoo provider |
| Request/audit/metric identifiers | Worker request pipeline | Structured logs/metrics | Reliability and security investigation | Central retention policy required | No raw project payloads in mutation audit | Operations access policy required | Arcigy infrastructure / future observability provider |
| Per-user Arcigy app activity | Authenticated foreground/focus/idle pulses; tenant and user ID added server-side | Tenant-scoped PostgreSQL activity tables and idempotent Odoo outbox; Odoo 19 addon after approval | Current app presence, bounded active intervals and daily app-active totals | Not approved; no automated deletion until legal/controller policy and recovery proof exist | TLS in transit; server-side credentials; exact pulse and Odoo field allowlists | Restricted Arcigy operations manager and dedicated read-only-CRUD integration bot | Arcigy infrastructure and configured Odoo provider after approval |

Technical gaps that cannot be inferred away: subject export/deletion lifecycle,
backup expiry propagation, processor inventory, approved retention schedules
and centralized observability access/retention. See `PRIVACY_REVIEW.md`.

Per-user activity is default off and requires both a global switch and an exact
tenant allowlist. It excludes input contents, key names, pointer coordinates,
screenshots, URLs, project/customer identifiers or content, IP addresses,
pricing and BOM data. It must not be represented as payroll or statutory work
time. See `USER_ACTIVITY_ODOO.md`.
