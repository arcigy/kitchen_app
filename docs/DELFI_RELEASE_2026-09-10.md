# DELFI release candidate — 10 September 2026

Status: local implementation complete; production promotion is not approved. Online DELFI verification and the exact live package plan remain blocked by the shared host running out of disk space. No customer database changes have been performed.

## Included behavior

- #22: direct drag of the selected cabinet in plan and 3D, preserved grab offset, one undo step, complete cancellation, origin outline and snap-edge feedback. Shared adjacency snapping for insertion, drag and Move; Fit Gap explicitly describes resizing.
- #23: one active kitchen layer drives the catalog and plan selection. Inactive plan cabinets are dimmed and excluded from click and marquee selection. 3D keeps the complete kitchen selectable. The saved active layer survives reopening.
- #24: optional doors remove the actual hinged/flap assemblies and their hardware from geometry and BOM. Drawers, fixed panels and their dimensions remain. Missing `hasDoors` keeps existing doors. Presets retain explicit false values, free dimensions and materials, persist through the real API and show actual geometry at current cabinet dimensions.
- #26: module-specific height labels and explanations describe existing geometry without changing stored dimensions or calculations. A base assembly of 820 mm with a 38 mm worktop contains a 782 mm cabinet including its plinth. Upper cabinet size is separate from mounting elevation.
- #25 double-click remains deferred.

Pricing review: composed tall cabinets now count doors from their actual slot layout. The previous generic door count could omit those fronts and hardware. This correction can change an existing tall cabinet's calculated price; compare representative DELFI tall cabinets before production approval.

## Source and main preservation

The source started at current `origin/develop` in isolated worktrees. The original checkout's unrelated unresolved merge remains untouched.

Delivered slices: PR145 (layers), PR146 (drag/snapping), PR147 (doors/preset preservation). PR148 covers preset creation/previews and PR149 height explanations.

The production parent is `f4d59af196af8addbddada20d9028e2030f45006`. The old PR117 release was squashed: its source `9dc724a4794e7267ec2ed894c17c1a6bb353d0d9` and main commit `c03d7f85a90950f1256034b14df3325901b18e37` have identical trees. Its develop parent `1b28574ba2f2690b0c48f4307026cecc5bc2e51e` is an ancestor of current develop.

The true main delta from that proven baseline spans six files. Five supplier-bridge/auth files were already incorporated into develop by `b7c90405`, followed by the shared exact-company login contract in `a61c9ecc` and newer preview-color work. Those newer implementations and their regression tests are preserved. The remaining deployment workflow changes retain the production trigger, separate target app/schema/object prefix, existing target preflight and PostgreSQL readiness check. Merge `af2cae96` records main ancestry without reverting current develop features.

## Targeted DELFI package update

An earlier bounded read confirmed `client_delfi` has 16 package rows in each of `dev` and `prod`. This does not establish that all 16 need an update. The later metadata query could not run because PostgreSQL entered disk-full recovery.

Use `planClientModuleDoorUpgrade` and the read-only CLI `scripts/planClientModuleDoorUpgrade.ts` to prepare exact package IDs after recovery. The CLI accepts a scoped snapshot on stdin, checks the requested tenant/schema, validates resulting packages, and prints only IDs, hashes, counts and the plan fingerprint. It cannot connect to or write a database. Run it on the existing host or an explicitly approved private restored copy; do not export customer package payloads implicitly.

The targeted operation:

1. Matches an existing package only to the same trusted runtime builder and module type. Unknown/custom builders require review.
2. Adds the `hasDoors` definition and its UI control/group when absent. Existing false defaults stay false.
3. Preserves every original parameter default, material rule, commercial rule, geometry, placement constraint, identity, asset and client preset. Existing preset IDs win; new system presets are appended through the established merge owner.
4. Recomputes package integrity and updates only `packageHash` in the exact existing catalog entry. It preserves legacy catalog IDs, disabled status, names, sizes and pricing references. Repeating the operation is idempotent.
5. Fails on absent or ambiguous references instead of adding or reassigning client modules.

Do not use a wholesale system-template refresh for this release: that existing operation intentionally replaces several client defaults. Do not use broad catalog reconstruction on the live shared host.

Before an approved write: obtain the exact per-environment metadata plan, verify an off-host backup and restore evidence, retain the original affected package rows and catalog revision in an approved private backup, and record the before hashes. The eventual write must use one tenant-scoped transaction for the affected packages and catalog hashes, compare current hashes/revisions against the approved plan, and abort on drift. An executable database writer and exact live plan are still pending live-state inspection; this document does not authorize either.

## Validation evidence

- Clean dependency installation; typecheck, build and lint pass.
- Combined release: 390 unit-test files, 2518 passed and one existing skip.
- Eight package-refresh/upgrade tests cover exact preservation, false values, hash synchronization, idempotency and refused targets.
- The CLI was exercised on a synthetic package and emitted a valid metadata-only plan.
- Production dependency audit: no high or critical production advisories.
- Live GitHub protection for both main and develop requires strict `verify` and `CodeQL` checks, PRs and administrator enforcement; force push/deletion are disabled. Secret scanning, push protection and Dependabot security updates are enabled.
- Release blocker: historical Google API Key alerts 1–3 remain open with no resolution recorded. Provider revocation and the required `revoked` disposition have not been verified. Secret values were not read.
- Full UI validation for the combined preset/height branch passed, including 55 direct-drag, 25 door/height and 26 preset checks, save/load, full FQP and recovery; browser console errors zero.
- The release worktree's independent fresh-runtime full UI run also passed, including save/load, FQP and recovery with zero console errors. Placement audit passed for nine packages. The tracked secret scan passed. A local CycloneDX 1.5 SBOM parsed with 40 production components; CI must publish the artifact for the exact PR head.
- MANUAL_TEST_LOG.csv rows 636–640 contain the non-programmer test paths. Online founder acceptance is still pending.

The synthetic file-runtime tests do not prove real DELFI pricing/catalog compatibility or recovery of a production backup. Existing protected CI also exercises isolated PostgreSQL restore, authorization, save idempotency, accessibility, dependency policy and CodeQL. Require green results for the exact release head, including its production SBOM artifact.

## Online acceptance and rollback

First recover disk headroom using the separately reviewed retention plan. At 00:02 CEST, the host had zero available space and the shared PostgreSQL log reported `No space left on device` during its recovery checkpoint. No image cleanup or database restart has been performed by this work.

After recovery, verify `/health` and `/ready`, confirm the deployed develop commit, inspect the exact DELFI package plan and apply only the separately approved tenant update. Then test with the founder: create a kitchen; insert, drag and snap cabinets in plan and 3D; switch layers; remove/restore doors; save/apply presets; inspect geometry, BOM and price; save and reopen; export and reopen FQP. Include existing projects, upper cabinets, rotated runs, corners and composed tall cabinets.

Before main promotion, complete `docs/release-checklist.md`, including branch protection, secret-alert disposition, exact-head CI/CodeQL/SBOM, schema/backup compatibility and online acceptance. Main merge, live data changes and destructive cleanup each retain their approval requirement.

Rollback: retain the current production image and the approved original DELFI rows/catalog revision before any write. Revert the release through a protected PR and redeploy the retained prior image. Restore only approved affected package/catalog records after comparing their current revision; do not overwrite presets or edits created after the update. Projects, materials, prices and unrelated tenant rows are never bulk replaced. A whole-database restore is a separately approved incident action, not the default rollback.
