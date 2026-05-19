# Multi-client isolation

## Tenant storage model

Production customer files must live under:

```txt
storage/
  clients/
    {clientId}/
      projects/
        {projectId}/
          project.meta.json
          phases/
            {phaseId}/
              saves/
              backups/
              exports/
              renders/
              uploads/
```

Server routes must derive `clientId` from the validated session, not from body, query parameters, localStorage, or frontend state.

## Production-blocked paths

Production runtime must not read or write customer output through global folders such as:

```txt
outputs/
public/debug-pdf/
exports/
renders/
uploads/
```

`public/debug-pdf/` and `outputs/` are guarded as dev-only debug output roots. Tenant output must use the storage path resolver and `StorageService`.

## Current legacy/debug paths

| Path or script | Category | Status |
| --- | --- | --- |
| `scripts/exportPdfPageStrokeGroups.ts` default `public/debug-pdf/stroke-groups/...` | dev-only/debug | Guarded against production. |
| `scripts/labelStrokeGroupsWithGemini.ts` output next to input summary | dev-only/debug | Safe only when input folder is dev/debug; keep out of production runtime. |
| `src/pdfDemo/wallRectangleConsistency.test.ts` reads `public/debug-pdf/generated-debug.dxf` | test-only | Test fixture path only. |
| `scripts/blender/fromJson.ts` | dev-only/debug | Uses tenant storage service with demo client context. |
| repository `outputs/` folder | legacy/debug | No production code path should use it. Needs cleanup/migration if old artifacts matter. |

## Project ownership

`project.meta.json` is the ownership source for a tenant project. It contains:

```json
{
  "version": 1,
  "projectId": "project_a",
  "clientId": "client_a",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "phases": ["phase_a"]
}
```

Rules:

- If metadata exists, `clientId` and `projectId` must match the validated session scope.
- New writes create or update metadata before writing tenant files.
- Missing metadata is default-deny for generic ownership checks.
- Same-client storage reads may use explicit legacy compatibility only when `ALLOW_LEGACY_PROJECT_READ=true` and after the URL client segment is matched to `session.clientId`.
- Invalid metadata is denied.

## Later migration

Next phase should migrate any valuable legacy files from global debug/output locations into tenant-scoped storage or delete them if they are disposable generated artifacts. Existing projects without `project.meta.json` should get a controlled metadata backfill based on trusted tenant inventory, not inferred from user input.

## Tenant inventory

Run the read-only inventory before any migration:

```bash
npm exec tsx scripts/tenantStorageInventory.ts
```

Optional project root override:

```bash
npm exec tsx scripts/tenantStorageInventory.ts -- --projectRoot C:\path\to\kitchen_app
```

The inventory never writes or deletes files. It scans:

```txt
storage/clients/*
outputs/
exports/
public/debug-pdf/
```

Report categories:

- `valid_tenant_projects_with_metadata`: tenant project has matching `project.meta.json`; action `keep`.
- `tenant_projects_missing_metadata`: tenant namespace is known, but metadata is missing; action `manual_review`.
- `legacy_candidates_for_migration`: global output roots such as `outputs/` or `exports/`; action `manual_review`.
- `debug_only_artifacts`: debug roots such as `public/debug-pdf/`; action `delete_candidate`.
- `orphan_unknown_artifacts`: unknown tenant/global structure; action `manual_review`.
- `unsafe_skipped_paths`: unsafe names or paths; action `unsafe_skip`.

Each entry includes path, detected IDs when safe, metadata status, recommended action, reason, file count, total size, and last modified timestamp.

Recommended workflow:

1. Run inventory.
2. For every `manual_review`, identify the owning client/project from trusted external records.
3. Run dry-run migration for approved sources.
4. Run write migration with `ALLOW_TENANT_STORAGE_MIGRATION=true` and `scripts/tenantStorageMigration.ts --write`.
5. Verify `project.meta.json` and tenant target files.
6. Clean up debug artifacts only with explicit delete confirmation.
7. Disable legacy read by leaving `ALLOW_LEGACY_PROJECT_READ` unset.

## Legacy migration helper

`scripts/legacyStorageMigration.ts` is deprecated and read-only. It can only inspect a single legacy source and print a report with the tenant target it would have used before the trusted mapping workflow existed.

It must not copy, move, delete, create `project.meta.json`, or write migration reports. Use the mapping-based workflow below for every real migration.

## Trusted mapping migration

No legacy data may be migrated based on folder names alone. Create a trusted mapping file first:

```json
{
  "items": [
    {
      "sourcePath": "outputs/project-a/export.json",
      "targetClientId": "client_a",
      "targetProjectId": "project_a",
      "targetPhaseId": "phase_a",
      "artifactType": "export",
      "action": "migrate",
      "reason": "Matched from approved tenant inventory"
    },
    {
      "sourcePath": "public/debug-pdf/generated-debug.dxf",
      "targetClientId": "client_a",
      "targetProjectId": "project_a",
      "targetPhaseId": "phase_a",
      "artifactType": "debug",
      "action": "delete_candidate",
      "reason": "Generated debug artifact; not production data"
    }
  ]
}
```

Supported `artifactType` values:

```txt
save
backup
export
render
upload
debug
```

Supported `action` values:

```txt
migrate
skip
delete_candidate
```

Dry-run is the default and writes nothing:

```bash
npm exec tsx scripts/tenantStorageMigration.ts -- --mapping trusted-mapping.json
```

Write migration requires both `--write` and the env guard:

```bash
ALLOW_TENANT_STORAGE_MIGRATION=true npm exec tsx scripts/tenantStorageMigration.ts -- --mapping trusted-mapping.json --write
```

If a target file already exists, the item is reported as `conflict` and is not overwritten. Overwrite requires explicit `--overwrite`:

```bash
ALLOW_TENANT_STORAGE_MIGRATION=true npm exec tsx scripts/tenantStorageMigration.ts -- --mapping trusted-mapping.json --write --overwrite
```

Write mode copies only. `delete_candidate` never deletes legacy files.

Write reports are saved under:

```txt
storage/migration-reports/
```

Report fields include:

- `startedAt`
- `dryRun`
- `migratedCount`
- `skippedCount`
- `conflictsCount`
- `errorsCount`
- per-item result with target paths, conflicts, errors, and missing metadata status

## Deprecated single-source helper

Legacy project/debug artefacts can still be inspected one source at a time through:

```bash
npm exec tsx scripts/legacyStorageMigration.ts -- --clientId client_a --projectId project_a --phaseId phase_a --source outputs/project_a
```

The helper is permanently read-only. Passing `--write` is rejected. It scans the source and prints a deprecated report, but does not create metadata, copy files, write a report file, or delete anything.

Allowed legacy source roots are:

```txt
outputs/
public/debug-pdf/
exports/
```

The reported target is always under tenant storage:

```txt
storage/clients/{clientId}/projects/{projectId}/phases/{phaseId}/{bucket}/legacy-migration/
```

Use `--bucket exports|renders|uploads|saves|backups` to override the default `uploads` bucket in the report. The script rejects unsafe IDs, path traversal, source paths outside allowed legacy roots, and any target that escapes the tenant namespace.

## Cleanup and deletion

Migration scripts must not delete legacy files. `delete_candidate` means "review manually later"; it is not an executable delete operation.

## Migration report

The deprecated single-source helper prints its read-only report to stdout only. Trusted mapping write migrations save reports under `storage/migration-reports/`.

Deprecated single-source report fields:

- `sourcePath`
- `targetTenantPath`
- `clientId`
- `projectId`
- `phaseId`
- `filesCopied`
- `skippedFiles`
- `errors`
- `dryRun`
- `timestamp`
- `deprecated`
- `nextSteps`

## Runtime boundary

Production runtime must not import or call `scripts/legacyStorageMigration.ts` or `scripts/tenantStorageInventory.ts`. Migration and inventory are never run during request handling. If ownership is unclear during runtime reads, default behavior is deny. The temporary same-client legacy storage read path only works with `ALLOW_LEGACY_PROJECT_READ=true`; keep it unset in production once inventory and migration are complete.

## Rollback

For copy-only migrations, rollback is deleting the new tenant files and the generated migration report, then restoring the previous `project.meta.json` from backup/version control if it was changed. Legacy source data is never deleted by migration scripts.
