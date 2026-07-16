# Arcigy testing contract

Tests protect existing functionality; they do not authorize live data changes or prove 1,000-user capacity by themselves.

## Required layers

- focused unit tests for changed business rules and parsers;
- repository/integration tests for PostgreSQL/file parity, tenant ownership, concurrency, retries, and errors;
- negative authorization and cross-tenant tests for every tenant-owned operation;
- full Vitest suite, typecheck, lint, and production build;
- browser UI regression for editor, modules, materials, pricing/BOM, save/load, versions, FQP roundtrip, and console errors;
- representative online-tenant manual smoke without modifying real projects unless explicitly approved;
- load/failure/restore tests only in an isolated environment.

## Standard gate

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:ui-regression
```

UI tests require the isolated `npm run dev:local` runtime. `npm run dev:online:postgres` is for controlled representative tenant verification and must not be used for automated write/regression/load tests while it points at production data.

The PostgreSQL restore gate is also isolated and synthetic:

```powershell
$env:ARCIGY_RESTORE_DRILL_ISOLATED = "true"
npm run test:db-restore-drill
```

It refuses configured database URLs and remote Docker endpoints, creates only uniquely named labelled disposable resources, and verifies a real `pg_dump`/`pg_restore` roundtrip. A green synthetic drill does not replace an encrypted off-host production backup, PITR, or an approved real-backup restore exercise.

If the local Docker engine is unavailable, use the equivalent portable backend:

```powershell
$env:ARCIGY_RESTORE_DRILL_ISOLATED = "true"
$env:ARCIGY_RESTORE_DRILL_POSTGRES_BIN = "C:\path\to\pgsql\bin"
npm run test:db-restore-drill:portable
```

The portable path must use a reviewed PostgreSQL 16 directory and still refuses every configured application database URL. It starts no Windows service and removes its random loopback-only temp cluster after success or failure.

The GitHub `verify` job enforces the same browser gate and the separate disposable PostgreSQL restore drill. It installs Chromium, starts `scripts/devLocal.ts` with `APP_ENV=dev`, the `dev` schema/object namespace, `KITCHEN_PROJECT_STORAGE=file`, and no `DATABASE_URL`, requires `/ready`, then runs `npm run test:ui-regression`. The runtime is always terminated as one process group; on failure only the synthetic runtime log is uploaded. The PostgreSQL step uses its own temporary Docker container and never shares the UI runtime or an online tenant connection. Do not point either job path at a shared URL or database.

## Evidence rules

- Record exact command, exit code, test count, environment, relevant fixture/tenant class, and known limitations.
- A narrow test supports only its covered contract; do not use it to claim whole-product safety.
- A green build does not prove runtime routing, database migration, restore, tenant isolation, or capacity.
- A capacity claim requires the staged isolated plan in `docs/SAAS_LOAD_TEST.md`, predefined thresholds, telemetry, first saturated resource, and recovery evidence.
- Add a non-programmer manual path to `MANUAL_TEST_LOG.csv` for implemented behavior changes.
- Never weaken, skip, retry-away, or rewrite an unrelated failing test merely to make a gate green.
