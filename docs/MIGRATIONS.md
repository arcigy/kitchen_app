# Arcigy migration contract

Database, storage, tenant, catalog, and project-format migrations must preserve old releases and customer data through an expand/migrate/contract sequence.

## Database migration rules

- Migrations are ordered files under `db/migrations/` and recorded in `schema_migrations`.
- `src/core/database/migration-version.ts` is the runtime readiness manifest. Its regression test requires an exact match with every ordered SQL file; adding a migration without updating the manifest fails the test.
- Each migration runs transactionally through `npm run db:migrate`.
- Run against the explicit validated environment schema; never point develop at `prod`.
- Expand first: add nullable columns/tables/indexes and dual-compatible code.
- Migrate/backfill in bounded, restartable, tenant-scoped batches with progress and checksums/counts.
- Deploy code that can read old and new forms before switching writes.
- Contract only in a later approved release after usage/reference proof, backup, restore test, and rollback-window expiry.
- Never auto-run a destructive migration on every app replica.
- PostgreSQL startup and `/ready` fail closed when any manifest migration is absent. Readiness never applies migrations or mutates the selected schema.

## Required migration package

Every change needs:

- purpose, owner, affected tables/tenants/objects and estimated volume;
- forward SQL/code, dry-run, query plan/lock analysis, timeout, and concurrency behavior;
- compatibility matrix for previous/current app releases;
- pre/post row counts, constraints, indexes, checksums, and tenant-negative checks;
- backup/restore point and explicit rollback;
- manual product verification for project open/save, catalog, pricing/BOM/export where affected.

## Data and storage safety

- Copy before switching; never move/delete first.
- Resolve every file through the tenant storage resolver and verify source/target containment.
- Compare per-file checksum, count, bytes, ownership, and tenant/project path before cutover.
- Keep the old source read-only through the accepted rollback window.
- Do not migrate unknown legacy files without a trusted mapping and dry-run report.
- Restore drills always target an isolated database/schema/server, never live production.

## Current P0 migration

Develop isolation, durable application files, off-host backup/PITR, disk retention, and deployment must follow the exact ordered procedure in `docs/SAAS_P0_MIGRATION_PLAN.md`.

Required checks after an implementation slice:

```powershell
npm run typecheck
npm test
npm run build
npm run test:ui-regression
```

Also run focused migration/repository tests, `npm run db:migrate` against an isolated target twice to prove replay safety, a previous-release compatibility smoke, Graphify update, and the release checklist.
