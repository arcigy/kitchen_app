# Arcigy per-user app activity and Odoo integration

Status: implemented, default off, not approved for live collection or live
Odoo writes.

This feature measures signed-in **Arcigy app-active time**. It is not an
attendance, payroll, working-time, productivity, or employee-monitoring claim.
An `active` interval requires a visible, focused Arcigy page and recent user
interaction. A visible page without interaction becomes `idle`; a hidden or
unfocused page is not counted as active.

## Data contract

The browser pulse is an exact allowlist of five fields:

- random page tracker UUID;
- monotonically increasing sequence number;
- `active`, `idle`, or `hidden` state;
- browser-local calendar date;
- IANA time zone.

The authenticated server adds only the existing tenant ID and user ID. The
feature never sends typed text, key names, pointer coordinates, screenshots,
URLs, project IDs, project/customer content, IP addresses, pricing, BOM, or
module data. User IDs never enter Prometheus labels or the existing anonymous
browser-runtime telemetry. High-frequency pulses are also excluded from the
business mutation audit log; the bounded activity tables are their sole event
source.

PostgreSQL stores short-lived per-page leases, one current presence row per
tenant/user, bounded active intervals, one daily summary per local date, and an
idempotent Odoo outbox.

Multiple tabs do not multiply time: accounting advances through one locked
tenant/user presence cursor. Pulses arrive every 30 seconds, idle begins after
5 minutes, the online lease expires after 90 seconds, and any final interval
after a crashed browser is capped at 45 seconds. Duplicate sequences are
ignored. A local-date/time-zone change closes the old interval and opens a new
one. The worker reconciles expired leases independently of Odoo; the sync job
repeats the same idempotent reconciliation before exporting a batch.

## Application configuration

Tracking is enabled only when both controls match:

```text
ARCIGY_USER_ACTIVITY_TRACKING_ENABLED=true
ARCIGY_USER_ACTIVITY_TRACKING_CLIENTS=exact-client-id-1,exact-client-id-2
```

There is deliberately no wildcard tenant value. Optional bounded tuning:

```text
ARCIGY_USER_ACTIVITY_HEARTBEAT_MS=30000
ARCIGY_USER_ACTIVITY_IDLE_MS=300000
ARCIGY_USER_ACTIVITY_OFFLINE_MS=90000
ARCIGY_USER_ACTIVITY_MAX_CREDIT_MS=45000
```

When enabled, the app shows a small live status badge and exposes its disclosure
text as a tooltip. When disabled, it mounts no activity listeners or badge and
the pulse endpoint returns 404.

## Odoo 19 addon and sync

The installable source is in `odoo-addons/arcigy_user_activity`. It provides
Current Presence, Daily Activity, and Intervals views. Human access requires
**Arcigy Activity Manager**.

Create a dedicated Odoo API-key account with only **Arcigy Activity Integration
Bot**. That account has read-only CRUD ACLs. The validated
`ingest_activity_batch` method checks the bot group, exact field allowlists,
types, bounds, time zones, batch size and idempotency key before using elevated
ORM writes. Direct JSON-2 create/write/delete remains denied.

The sync uses Odoo 19 JSON-2:

```text
POST /json/2/arcigy.user.activity.presence/ingest_activity_batch
```

Configure a server-side scheduled job (recommended every minute) with secrets
from the approved secret store:

```text
ARCIGY_USER_ACTIVITY_ODOO_SYNC_ENABLED=true
ARCIGY_USER_ACTIVITY_ODOO_ENVIRONMENT=develop
ARCIGY_ODOO_URL=https://odoo.example.com
ARCIGY_ODOO_DATABASE=database-name
ARCIGY_ODOO_API_KEY=secret-from-vault
DATABASE_URL=secret-from-vault
DATABASE_SCHEMA=dev-or-prod
npm run odoo:user-activity:sync
```

Optional job bounds are `ARCIGY_USER_ACTIVITY_ODOO_BATCH_SIZE` (default 200),
`ARCIGY_USER_ACTIVITY_ODOO_MAX_BATCHES` (default 10), and
`ARCIGY_USER_ACTIVITY_ODOO_LEASE_MS` (default 120000). HTTPS is mandatory
outside loopback. Rows are leased with `FOR UPDATE SKIP LOCKED`; successful
batches are acknowledged, failures return to pending with bounded exponential
backoff, and newer updates cannot be marked sent by an older lease.
Develop and Main are stored separately and are part of every Odoo idempotency
key; a production database is hard-bound to `main` and a development database
to `develop`.

## Safe activation order

1. Obtain legal/controller approval for purpose, lawful basis, employee notice,
   access roles, retention period, subject access/export/deletion and Odoo as a
   recipient/processor. Complete a DPIA decision where applicable.
2. Back up PostgreSQL and apply migration `0005_user_activity` in Develop.
3. Install the Odoo 19 addon in a non-production Odoo database; assign manager
   and integration groups to separate accounts and generate a dedicated key.
4. Run the sync with synthetic Develop users and verify create, update,
   duplicate replay, stale update, retry and offline reconciliation.
5. Enable one exact Develop tenant, verify the disclosure badge and compare a
   timed active/idle/background scenario with PostgreSQL and Odoo.
6. Approve a retention policy and implement/test tenant/user export and erasure
   before production. Production activation and production Odoo scheduling are
   separate live changes requiring founder approval.

## Manual acceptance scenario

Use synthetic accounts only. Sign in as User A, keep the app focused for two
heartbeats, open a second tab for one minute, leave both tabs untouched beyond
the idle threshold, resume one tab, then hide/close it. Sign in as User B and
repeat a short interval. Run one sync.

Expected results:

- Odoo shows distinct exact IDs for Users A and B;
- two User A tabs do not double the total;
- idle and hidden time is excluded;
- an abrupt close becomes offline after the lease expires;
- replaying a batch does not create duplicates;
- no customer/project content appears in browser requests, PostgreSQL outbox,
  application logs, Prometheus, or Odoo.

## Rollback and open policy gate

Disable `ARCIGY_USER_ACTIVITY_TRACKING_ENABLED` and stop the Odoo sync schedule.
This immediately stops new collection without deleting existing rows. Do not
drop tables or purge PostgreSQL/Odoo data until the approved retention and
recovery procedure defines the exact scope, backup consequences and deletion
evidence. There is intentionally no automatic retention deletion in this
change.
