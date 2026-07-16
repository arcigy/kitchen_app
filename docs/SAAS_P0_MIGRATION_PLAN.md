# Arcigy P0 infrastructure migration plan

Date: 2026-07-16  
State: execution plan only; no live mutation is authorized by this document

Use together with `SAAS_SCALE_READINESS_AUDIT_2026-07-15.md`, `SAAS_OPERATIONS_RUNBOOK.md`, and `release-checklist.md`.

## Fresh read-only evidence

The live CapRover inspection refreshed on 2026-07-16 proved:

- host root disk: 38 GB total, 35 GB used, 1.5 GB free, 97%;
- Docker images: 28.04 GB, with 26.73 GB reported reclaimable;
- `arcigy-kitchen-develop`: `APP_ENV=prod`, `DATABASE_SCHEMA=prod`, no mount;
- `kitchenapp`: `APP_ENV=prod`, `DATABASE_SCHEMA=prod`, no mount;
- production `/app/storage`: approximately 56 MB in 23 files inside the running container;
- PostgreSQL data uses the persistent volume `captain--kitchenapp-db-data`;
- PostgreSQL: `archive_mode=off`, `archive_command=(disabled)`, `wal_level=replica`;
- no application PostgreSQL backup timer, cron entry, backup container, or WAL archive process was found.
- the `prod` schema has all 4 repository migrations, 3 projects, 3 active saves, and 19 versions; the existing `dev` schema has only migration `0001`, zero projects, zero saves, and only 5 module packages, so switching develop to it without an approved migrate-and-seed/copy step would hide current projects and modules;
- GitHub provider secret scanning and push protection are enabled, but three unresolved historical Google API key alerts remain: one in `.env.bak` and two in `GEMINI.md`; one historical line labels its key as the production Railway key. Current CapRover definitions for `arcigy-kitchen-develop` and `kitchenapp` do not contain `GEMINI_API_KEY`.

The repository deploy workflow now has a fail-closed preflight for the target app definition. It refuses a missing app, develop-to-production namespace cross-wiring, ephemeral or read-only `/app/storage`, multiple replicas with local volume storage, and volume-changing service overrides. A read-only check confirms the current develop definition is rejected at `APP_ENV`; this is a guardrail, not a substitute for the approved migration below.

Both worker entrypoints also fail before repository creation when a production build is configured with file/implicit project storage, a missing database connection, an implicit namespace, or mismatched environment/schema/object prefix. A real negative startup probe exited without opening the worker port and without exposing its database URL. This closes the silent production fallback path locally, but the current live develop namespace and mount remain unchanged until the approved migration.

Database readiness now verifies the complete ordered repository migration manifest, not only the latest migration marker. The manifest is regression-locked to every SQL file, and a schema missing any earlier migration fails before application work; the check is read-only and never auto-migrates live data.

A persistent database volume protects against a container replacement. It does not protect against database corruption, operator error, host loss, ransomware, or deletion of the volume and is not an off-host backup.

The repository now contains a fail-closed synthetic PostgreSQL 16 backup/restore regression. It refuses configured database URLs and remote Docker engines, migrates and seeds only its own labelled disposable Docker container or loopback-only portable temp cluster, runs real `pg_dump`/`pg_restore`, and compares exact restored evidence. A portable PostgreSQL 16.14 run passed locally with 4 migrations, 24 tables, 32 rows, 49 constraints, 45 indexes, zero tenant-boundary leakage, synthetic RPO 0, and measured RTO 1.694 seconds; all processes and temp data were removed afterward. This makes the logical restore procedure executed and repeatable but does not close P0: the approved encrypted off-host destination, continuous WAL/PITR, real backup schedule, and real-backup restore evidence are still absent.

## Backup implementation status (2026-07-16)

The repository now contains a separate deployable worker in `ops/backup/`.
It uses PostgreSQL 16 `pg_dump`, streams a custom-format dump through
AES-256-GCM encryption with a scrypt-derived key, and uploads B2 large-file
parts directly off-host. It writes no local dump file, never deletes a remote
object, holds a PostgreSQL advisory lock to prevent overlapping schedules, and
fails closed unless its B2 key is restricted to the target bucket plus the
`arcigy/prod/` prefix with only `listFiles`, `readFiles`, and `writeFiles`.
Its paired restore command defaults to a download/decrypt/archive verification
only; actual `pg_restore` additionally requires an explicit acknowledgement and
a newly named loopback `arcigy_restore_*` target, so it cannot target the live
CapRover database.

This is implementation and test evidence only. It is not a live backup until a
single private CapRover worker is configured with server-side secrets, a first
object is uploaded, and a selected object is restored into an isolated
PostgreSQL 16 target. The B2 bucket has a displayed 35-day default Object Lock
retention period, but the provider UI did not independently expose whether its
mode is Compliance; verify the mode before deployment. The existing B2
application key has broader permissions than this worker accepts, so it must be
replaced by a dedicated least-privilege key before deployment. Do not use the
broad key as a production backup credential.

As of 2026-07-16, the provider also reports that B2 access is suspended until
the account is returned to good standing and a phone number is present for API
access. This is an external account prerequisite: do not deploy the worker,
copy a backup credential into another store, or weaken its permission checks
while the account is suspended.

## P0 credential containment prerequisite

Before any Arcigy release:

1. the owner of the historical Google Cloud/Railway credentials identifies the three keys in the provider consoles without copying their values;
2. revoke all exposed keys, or rotate an active consumer to a least-privilege replacement first and immediately revoke the exposed key;
3. verify the current CapRover applications continue through their documented no-Gemini fallback or an approved replacement secret;
4. mark GitHub alerts 1, 2, and 3 as `revoked`, never `false positive`, and retain provider revocation timestamps outside the repository;
5. rerun `npm run security:secrets`, CI, assistant fallback tests, and a live assistant/core-editor smoke;
6. do not rewrite Git history unless separately approved; revocation is the security fix and history rewriting is only disruptive cleanup.

Credential rotation, provider revocation, GitHub alert resolution, and enabling validity checks are external mutations and require explicit user authorization plus access to the owning Google Cloud/Railway accounts.

## Decisions required before execution

Recommended baseline:

1. Develop data: create schema `dev`; copy only an explicitly approved tenant snapshot for compatibility testing, otherwise seed synthetic data.
2. App files: use separate CapRover persistent volumes now (`prod` and `dev`) because the current 56 MB migration is small and requires no product rewrite. Re-evaluate S3-compatible object storage after file growth and multi-replica needs are measured.
3. Backup: encrypted S3-compatible off-host storage in a different failure domain; continuous WAL archive plus daily full backup.
4. Recovery target: RPO 15 minutes, RTO 4 hours; retain 7 daily, 4 weekly, and 6 monthly restore points.
5. Docker rollback retention: current image plus three previous successful releases per Arcigy app; remove only older images not referenced by a running container.

The operator must provide the approved backup destination and credentials through the server secret store. Never put credentials in this repository, commands committed to Git, logs, or chat.

## Mandatory execution order

### 0. Change freeze and evidence

- stop Arcigy deployments and load tests;
- record current service image references and replicas;
- confirm `/health` and `/ready` are 200;
- record database size, row counts per tenant-scoped table, storage file count/bytes, and checksums without copying customer payloads;
- preserve the current and previous known-good images.

Rollback: no state has changed.

### 1. Establish off-host backup before other mutations

- configure an encrypted backup tool with credentials supplied only through CapRover secrets;
- stream the first full PostgreSQL backup directly off-host because the server has insufficient local disk headroom;
- copy the current production `/app/storage` tree off-host with tenant paths and checksums preserved;
- verify remote object size, checksum, encryption, retention lock/versioning where supported, and backup logs;
- restore both artifacts into an isolated database/container and prove representative login, project list/open, catalog, BOM/pricing, asset access, and tenant-negative checks;
- record achieved RPO/RTO and the exact restore-point identifier.

Rollback: backup setup is additive. Remove no source data.

### 2. Recover disk headroom

Dry-run inventory only:

```sh
docker system df
docker ps --no-trunc --format '{{.Image}} {{.Names}}'
docker image ls --no-trunc --format '{{.Repository}} {{.Tag}} {{.ID}} {{.CreatedAt}} {{.Size}}'
```

Create an explicit allow-list containing only image IDs that are:

- not referenced by any running or stopped rollback container;
- older than the three retained successful releases for their app;
- not PostgreSQL, CapRover, nginx, tunnel, monitoring, or backup dependencies.

Generate the first reviewed allow-list with the permanently read-only repository tool `npm run ops:plan-image-retention -- --images <images.json> --containers <containers.json> --captured-at <ISO-8601>`. It accepts only complete Docker inspect metadata, fails when container references are incomplete, targets only the two exact Arcigy application repositories, retains current plus three rollback releases, protects shared tags and every running/stopped-container reference, and emits a snapshot hash plus approval fingerprint. Re-capture immediately before approval and add `--verify-plan <reviewed-plan.json>`; inventory drift fails verification. The tool has no deletion path and does not authorize removal.

Remove only the reviewed IDs one by one with `docker image rm <approved-id>`. Never use a blind global prune. Recheck disk, every service replica, `/health`, and `/ready`. Target below 80% used and keep at least 20% free.

Rollback: retained image IDs remain available. If a required image was omitted from retention, stop and rebuild it from the recorded source release before continuing.

### 3. Make application files durable

- create separate persistent volumes for production and develop;
- stop writes or briefly stop the production app for the final delta;
- copy `/app/storage` to the production volume without deleting the source;
- verify 23/23 files, total bytes, per-file checksums, owner/mode, and tenant-safe relative paths;
- configure the CapRover persistent-directory mapping to mount the production volume at `/app/storage`;
- start one replica and verify assets, export, render, project open/save, and tenant access;
- redeploy once and prove the same files/checksums remain;
- repeat with a separate empty or approved-copy develop volume.

Rollback: revert the mount configuration to the recorded prior service definition and previous image. Keep both source and copied data until acceptance; delete neither.

Use the repository-owned read-only manifest for the source, post-copy target, and post-redeploy target: `npm run ops:storage-manifest -- --root <absolute-root>`. Compare each target with `npm run ops:storage-manifest -- --verify-source <source.json> --verify-target <target.json>`. A mismatch in any relative path, file content, byte count, directory, mode, UID, or GID blocks cutover. Symbolic links, special files, and data changing during capture fail closed. The tool cannot copy, move, delete, mount, or deploy.

### 4. Isolate develop

Required environment contract:

```text
develop:    APP_ENV=dev   DATABASE_SCHEMA=dev   object prefix=dev
production: APP_ENV=prod  DATABASE_SCHEMA=prod  object prefix=prod
```

- create and migrate schema `dev` using the current transactional migration command;
- populate it with synthetic data or the explicitly approved tenant snapshot;
- switch only `arcigy-kitchen-develop` to the `dev` namespace and develop storage volume;
- verify that a create/save/delete in develop changes no production row count, timestamp, object key, or file checksum;
- run login, project list/open/save/reopen, catalog, Materials, pricing/BOM, export/render, and cross-tenant negative tests.

Rollback: restore the prior develop service environment for emergency read-only diagnosis only. Do not resume develop writes into `prod` after isolation is accepted.

### 5. Enable PITR and recurring restore proof

- enable continuous WAL archival to the approved off-host destination;
- retain daily full backups and WAL according to policy;
- alert on missed full backups, WAL archive lag/failure, age of last restorable point, storage growth, and restore-test failure;
- perform a scheduled isolated restore at least monthly;
- verify database constraints, migrations, tenant row counts, representative project/BOM totals, and asset references;
- store only checksums, counts, timings, and restore identifiers as evidence.

Rollback: if WAL archival destabilizes PostgreSQL, disable only the new archive command using the recorded configuration, keep the verified full backup, and investigate before retrying. Never delete existing backup objects during rollback.

### 6. Deploy the verified application release

- follow `docs/git-github-codex-workflow.md` and `docs/release-checklist.md`;
- deploy to isolated develop first;
- verify protected metrics, request budgets, login, current projects, first/cached open, edit/save/reopen, versions, Materials, pricing/BOM, FQP, export/render, and zero console errors;
- inspect request-ID logs and SLO signals;
- retain the previous image and database/storage restore points;
- promote only after user acceptance.

## Completion evidence

P0 is complete only when all of the following are attached to the audit:

- develop write-isolation proof;
- persistent-file checksum before/after redeploy;
- off-host backup identifier and automated schedule;
- isolated restore evidence with achieved RPO/RTO;
- disk below threshold with retained rollback images listed;
- develop and production post-deploy smoke evidence;
- no regression in the functionality-preservation contract;
- no customer data or feature removed without explicit approval.
