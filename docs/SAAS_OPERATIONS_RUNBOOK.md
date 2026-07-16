# Arcigy SaaS operations runbook

Use together with `docs/database-operations.md`, `docs/release-checklist.md`, and `docs/SAAS_SLO.md`.

## Safety rules

1. Preserve customer projects, catalogs, modules, pricing, BOM, exports, renders, and tenant ownership.
2. Start with read-only evidence. Record time, environment, request ID, affected journey, last known good release, and responder.
3. Never print secrets or customer payloads. Use names, masked identifiers, counts, hashes, and paths.
4. Do not prune images, delete files, alter live schemas, rotate credentials, restore, or roll back without explicit authorization and a rollback plan.
5. Treat develop as unsafe for load or destructive testing until it is proven isolated from `prod` schema and storage.

## Severity

- `SEV-0`: suspected tenant exposure, project/pricing corruption, unrecoverable data loss, or compromised credentials. Stop deploys immediately.
- `SEV-1`: core login/project-open/save unavailable for multiple users, database unavailable, disk critical, or bad release.
- `SEV-2`: degraded performance, one dependency unavailable with fallback, or isolated workflow failure.

## First five minutes

1. Check `/health` and `/ready` separately.
2. Capture the failing request ID and normalized route without request body or tenant data.
3. Check current and previous CapRover release, replica status, restart count, host disk/inodes, and database connectivity.
4. Stop additional deployment. Do not restart repeatedly before capturing logs and resource state.
5. Decide whether containment is rollback, traffic reduction, disabling an optional external integration, or database/storage recovery.

## Database unavailable or saturated

Read-only checks:

```powershell
Invoke-WebRequest https://<app-host>/health -UseBasicParsing
Invoke-WebRequest https://<app-host>/ready -UseBasicParsing
```

Then inspect PostgreSQL connection count, active/idle-in-transaction sessions, long queries, locks, database size, disk, WAL, and pool budget. Do not terminate sessions until the owning operation and transaction risk are understood.

Containment order:

1. stop new deployments and load tests;
2. reduce optional expensive traffic;
3. verify `replicas * POSTGRES_POOL_MAX` is within the connection budget;
4. terminate only proven stale sessions with recorded PID/query age/owner;
5. restore service and verify project list/open/save on an approved test project;
6. record root cause and prevention.

## Host disk above threshold

At 80% warn; at 90% treat as SEV-1 risk.

1. Inventory filesystem and Docker use without deleting anything.
2. Identify active images and the approved number of rollback generations.
3. Back up required data and confirm app/database persistent volumes.
4. Obtain explicit approval for the exact image/container/cache set to remove.
5. Remove only approved unused objects, then recheck disk, running containers, `/health`, and `/ready`.

Never run blind global prune commands while rollback requirements are unknown.

Repository read-only planner:

1. On the CapRover host, capture complete `docker image inspect` output for every unique image ID and complete `docker container inspect` output for every running and stopped container. Do not use shortened `docker image ls` output.
2. Transfer only those infrastructure metadata JSON files to an approved operator workspace; they contain image/container names but no application payloads.
3. Record the UTC capture time and run `npm run ops:plan-image-retention -- --images <images.json> --containers <containers.json> --captured-at <ISO-8601>`.
4. Review the exact managed repositories, retained entries, candidate full SHA-256 IDs, estimated bytes, `snapshotSha256`, and `approvalFingerprint`.
5. Re-capture the inventory immediately before approval and run the same command with `--verify-plan <reviewed-plan.json>`. Any changed image, size, tag, or container reference fails verification and requires a new plan.

The planner is permanently read-only: it cannot call Docker or delete anything. It only considers the exact `img-captain-kitchenapp` and `img-captain-arcigy-kitchen-develop` repositories, keeps the current plus at least three rollback releases for each, protects images referenced by running or stopped containers, protects shared tags, and leaves PostgreSQL, CapRover, nginx, tunnel, monitoring, backup, and all unrecognized repositories unmanaged. Actual one-by-one removal remains an approval-required live action.

## Durable application storage evidence

Before copying `/app/storage`, while writes are frozen, capture a content manifest from the source tree:

```sh
npm run ops:storage-manifest -- --root /app/storage > storage-before.json
```

After copy and again after redeploy, capture the mounted target tree the same way. Compare each target against the reviewed source:

```sh
npm run ops:storage-manifest -- --verify-source storage-before.json --verify-target storage-after-copy.json
npm run ops:storage-manifest -- --verify-source storage-before.json --verify-target storage-after-redeploy.json
```

The tool is permanently read-only. It recursively hashes regular file contents, counts exact bytes/files/directories, records POSIX mode/UID/GID, uses only contained relative paths, rejects symbolic links and special files, detects entries changing during capture, validates manifest digests before comparison, and fails on every missing, extra, content, size, type, owner, group, or mode mismatch. The absolute source and target roots may differ, but their complete relative trees must match. The manifest is evidence only and cannot copy, move, delete, mount, deploy, or authorize cutover.

## Bad deploy

Rollback when health/readiness fail, core smoke fails, tenant access changes unexpectedly, or project/pricing preservation cannot be proven.

1. stop promotion;
2. capture failing release SHA, logs, request IDs, migration state, and previous release ID;
3. if the schema is backward-compatible, restore the previous app release;
4. if a migration is involved, follow its explicit expand/migrate/contract rollback; never improvise destructive SQL;
5. verify login, project list/open/save/reopen, Materials, BOM, export, console, `/health`, and `/ready`;
6. keep the failed release and evidence until follow-up is complete.

## Backup and isolated restore

Current state: no verified off-host backup/PITR/real-backup restore schedule has been approved. This remains P0. A repository-owned synthetic `pg_dump`/`pg_restore` drill now exercises migrations and exact logical restoration inside one labelled disposable PostgreSQL container; it is a CI regression gate, not evidence that a production backup exists. The repository also contains an undeployed, fail-closed B2 streaming backup worker in `ops/backup/`; its focused encryption and permission tests do not prove an actual remote object or restore.

The ordered implementation and rollback procedure is in `docs/SAAS_P0_MIGRATION_PLAN.md`.

Required drill:

1. select a specific encrypted backup and record its timestamp/checksum;
2. restore into an isolated database/server and non-production schema;
3. run migrations only if the restore procedure requires and documents them;
4. verify row counts, constraints, tenant separation, representative project load, catalog, BOM/pricing, and asset references;
5. measure achieved RPO and RTO;
6. destroy the isolated copy only after approval and evidence retention.

Never overwrite the live production database during a drill.

Repository gate:

```powershell
$env:ARCIGY_RESTORE_DRILL_ISOLATED = "true"
npm run test:db-restore-drill
```

The command must fail when any existing database URL is present or Docker is remote. If Docker is unavailable, set an absolute reviewed PostgreSQL 16 `ARCIGY_RESTORE_DRILL_POSTGRES_BIN` and run `npm run test:db-restore-drill:portable`; this backend starts only a random loopback temp cluster and no Windows service. Preserve its JSON evidence containing backup checksum, schema/migration/table/row/constraint/index counts, representative pricing/BOM/asset checks, tenant-negative result, and achieved synthetic RPO/RTO. Then separately execute the approved encrypted real-backup drill above.

## External dependency failure

For Gemini, Démos, Supplier Bridge, Blender, or other integrations:

- confirm timeout/error rate and whether the core editor still works;
- keep safe fallbacks and actionable errors;
- do not retry indefinitely or multiply traffic;
- disable only the failing optional integration when isolation is proven and user-visible impact is communicated;
- never remove the feature permanently without the user's explicit decision.

## Credential rotation

1. inventory consumers without printing values;
2. create the replacement credential with least privilege;
3. update one environment at a time;
4. verify readiness and the owning workflow;
5. revoke the old credential only after confirmation;
6. check logs and repository history for exposure.

If a credential appeared in public Git history, treat it as compromised even when it is absent from the current branch:

1. stop releases that could depend on it and declare `SEV-0` until validity and consumers are known;
2. compare only masked identifiers or cryptographic equality inside approved secret stores; never copy the value into chat, tickets, logs, or commands committed to Git;
3. rotate or revoke it at the provider before resolving the alert; deleting the current file or rewriting history is not revocation;
4. verify every known environment and integration with the replacement or confirmed no-key fallback;
5. resolve the GitHub alert as `revoked`, retain provider-side revocation evidence, and rerun local plus server-side secret scans;
6. rewrite public history only as a separately approved cleanup because it disrupts clones and does not replace provider revocation.

## Suspected tenant exposure

1. declare SEV-0 and stop deploys and affected writes;
2. preserve logs, request IDs, session/user IDs, normalized routes, and database audit evidence without copying customer payloads;
3. revoke affected sessions/credentials only after scope is understood;
4. determine affected tenants, objects, time window, and access type;
5. follow legal/privacy notification requirements;
6. add a negative authorization regression before reopening the path.

## Incident closure

- core journey and SLO indicators stable;
- customer data and tenant ownership verified;
- rollback/recovery evidence stored;
- root cause, contributing factors, and detection gap documented;
- focused regression and manual test path added;
- follow-up owner and deadline assigned.
