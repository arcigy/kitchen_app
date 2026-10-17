# CRM client metrics

The app records a few business facts per client and sends daily aggregates to the client CRM in
Odoo (`arcigy/odoo`, addon `arcigy_client_crm`). The CRM answers business questions: is a client
producing offers (churn risk), what does the client cost us in AI, how good is the PDF intake for
them, and how many reports of which type they send. It is not time tracking of people.

## What the app records

| Data | Table | Written by |
|---|---|---|
| Offer PDF / pricing sheet generated | `arcigy_project_activity_events` (`offer.pdf_generated`, `offer.sheet_generated`) | browser after a successful export → `POST /api/projects/:id/offer-events` (Idempotency-Key, retried) |
| Offer marked as sent / reverted | `arcigy_project_activity_events` (`offer.marked_sent` with the server-computed price, `offer.sent_reverted`) | "Označiť ako odoslanú" button in the pricing panel → `PUT /api/projects/:id/offer-status`; also sets the project status to `sent` |
| Project deleted | `arcigy_project_activity_events` (`project.deleted` tombstone with the creation date) | project delete; keeps "projects created" history because projects are hard-deleted |
| AI provider call | `arcigy_ai_usage_events` (tokens, USD cost, feature, client/project/user) | `callOpenAiStructured` inside the assistant request scope (`runWithAiUsageScope`) |
| PDF intake proposal outcome | `arcigy_pdf_proposal_outcomes` | PDF intake (when it ships) at acceptance of a drawing |

Events outlive deleted projects (migration `0008_crm_client_metrics` drops the cascading foreign key
of the previously unused events table). AI costs come from the provider's token counts and the
versioned price table in `src/core/ai-usage/ai-pricing.ts`; a model missing from the table is stored
as `unpriced` with its tokens, never with an invented price.

Feedback reports use the client success types `usability_error`, `price_error`, `wish`, `question`,
`other`; legacy values from older clients are mapped. The project snapshot attached to a report no
longer carries the end customer's name, contact or address.

## Daily export

- Aggregation: `src/core/crm-export/crm-export-aggregation.ts` (pure, golden-tested). Days are
  calendar days in `Europe/Bratislava`. Per client and day: users, users active in the last 30 days
  (a result such as a project, an offer or a PDF decision, not logins), projects created/deleted,
  offers generated/sent, PDF intake outcomes and AI cost. Per client and month: AI cost per project
  (average, p90, max, count over the 0.10 USD target). Per user and month: result counts only.
- Privacy: only allow-listed clients leave the app, and only aggregates; no project names, end
  customers, single events or timestamps of people. User names, positions and app roles are sent so
  the CRM can show who uses the app.
- Schedule: the worker ticks hourly. After 02:30 local time it builds yesterday's batch once (last
  7 days; 35 days after a gap and every Monday), stores it in `arcigy_crm_export_batches` and
  delivers pending batches to `arcigy.client.export.batch.arcigy_ingest`. A PostgreSQL advisory lock
  keeps replicas and the CLI from exporting twice.
- Idempotency: the batch ID is derived from the content, Odoo upserts rows by natural key and
  applies a batch once. Failed deliveries stay pending and are retried every hour; after 24 failures
  an alert is logged and optionally posted to `ARCIGY_CRM_EXPORT_ALERT_URL`.

### Configuration

| Variable | Meaning |
|---|---|
| `ARCIGY_CRM_EXPORT_ENABLED` | `true` turns the export on (off by default) |
| `ARCIGY_CRM_EXPORT_CLIENT_KEYS` | comma-separated `organization_id`s to export, e.g. `client_delfi` |
| `ARCIGY_CRM_ODOO_URL`, `ARCIGY_CRM_ODOO_DATABASE` | Odoo base URL and database (fall back to `ARCIGY_ODOO_URL`/`ARCIGY_ODOO_DATABASE`) |
| `ARCIGY_CRM_ODOO_API_KEY` | API key of the Odoo user `arcigy-crm-ingest` (only allowed to ingest) |
| `ARCIGY_CRM_EXPORT_ENVIRONMENT` | label sent with the batch; defaults to `prod`/`dev` from `APP_ENV` |
| `ARCIGY_CRM_EXPORT_ALERT_URL` | optional ntfy-style URL for failure alerts |

### Manual runs

```bash
npm run crm:export -- --dry-run --from 2026-10-01 --to 2026-10-16   # print the batch
npm run crm:export -- --from 2026-09-01 --to 2026-10-16             # backfill and deliver
npm run crm:export                                                  # one scheduler tick now
```

## Rollout

1. Take a verified database backup, then run `npm run db:migrate -- --schema <dev|prod>` (adds
   migration `0008_crm_client_metrics`; additive). Readiness fails until it is applied.
2. Deploy the app. Offer events, AI usage and the feedback types start immediately.
3. Install `arcigy_client_crm` in Odoo, create the ingest user and its API key, link each client
   company to its `organization_id`.
4. Set the `ARCIGY_CRM_*` variables, run a `--dry-run`, then a backfill, then let the scheduler run.

## Verifying the numbers

- Each batch carries control totals; Odoo re-sums the received rows and flags a mismatch.
- Compare with the source after the first weeks: projects and offers with SQL on the app database,
  AI cost with the provider's usage export (±5 %), PDF corrections by checking a few drawings by hand.
