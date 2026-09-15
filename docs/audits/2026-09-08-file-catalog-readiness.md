# File catalog readiness — 8 September 2026

## Reproduction before implementation

The local editor release was blocked by four server test timeouts, also reproduced
on unmodified develop `1f83e431`. A synthetic catalog profile showed each new
repository reconstructing and cloning all 8,436 materials merely to obtain legacy
compatibility defaults. Package reconciliation also read each of 70 package JSON
files twice.

New regression tests failed before the fix: an unnecessary full seed, 140 package
reads instead of 70, four concurrent seeds instead of one, and a partial JSON read
during a paused save. A further injected disk failure exposed early completion of
the cold package seed while sibling writes were still running.

## Change and limits

Persisted catalogs now load only their small legacy compatibility defaults.
Reconciliation reuses the packages it already loaded. Repository instances in one
process serialize whole catalog operations by absolute tenant directory; unrelated
tenants and storage roots remain independent. Writes settle before the operation
releases the queue, including failure paths. There is no TTL cache hiding later
tenant edits and no test timeout increase.

This coordinates the existing file backend used by isolated fixtures and legacy
development. It is not a cross-process database transaction or crash recovery
mechanism. The authoritative online PostgreSQL backend and tenant data are unchanged.

## Evidence

- Full suite before the final failure-path addition: 2,313 passed, 0 failed, 1 existing skip.
- Final focused regressions: 7 passed, including two injected I/O failure/retry cases.
- Typecheck and production build passed; existing build size/i18n warnings remain.
- All 13 existing UI regression gates passed on an isolated file runtime, including
  project recovery, FQP roundtrip and clean browser console checks.
- Same-machine synthetic profile, milliseconds (cold / three warm reads):
  before `1415 / 1115, 1141, 1008`; after `1268 / 389, 377, 369`.
- Local raw evidence is in the isolated worktree `.tmp/readiness-*.json`,
  `.tmp/full-tests.json`, and `.tmp/UI-REGRESSION.json`; generated reports are not shipped.

## Manual verification

Start a fresh isolated file-storage app, open a project and its materials/margins
panels. Refresh and reopen them. Catalogs must load without HTTP 400 or JSON errors;
saved custom names, disabled modules and prices must remain intact. Normal online
develop verification uses its existing PostgreSQL tenant and does not require a
catalog reset or data migration.
