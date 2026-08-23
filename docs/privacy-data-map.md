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

Technical gaps that cannot be inferred away: subject export/deletion lifecycle,
backup expiry propagation, processor inventory, approved retention schedules
and centralized observability access/retention. See `PRIVACY_REVIEW.md`.
