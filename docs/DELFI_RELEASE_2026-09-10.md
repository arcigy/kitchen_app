# DELFI release candidate — 10 September 2026

Status: the scoped fixes are implemented and the read-only DELFI package plan is complete. The shared database recovered after the separately approved image cleanup. Production promotion, customer-data updates and migration execution are not approved. Online DELFI acceptance and backup/credential evidence remain outstanding. No customer database changes have been performed.

## Included behavior

- #22: direct drag of the selected cabinet in plan and 3D, preserved grab offset, one undo step, complete cancellation, origin outline and snap-edge feedback. Shared adjacency snapping for insertion, drag and Move; Fit Gap explicitly describes resizing.
- #23: one active kitchen layer drives the catalog and plan selection. Inactive plan cabinets are dimmed and excluded from click and marquee selection. 3D keeps the complete kitchen selectable. The saved active layer survives reopening.
- #24: optional doors remove the actual hinged/flap assemblies and their hardware from geometry and BOM. Drawers, fixed panels and their dimensions remain. Missing `hasDoors` keeps existing doors. Presets retain explicit false values, free dimensions and materials, persist through the real API and show actual geometry at current cabinet dimensions.
- #26: module-specific height labels and explanations describe existing geometry without changing stored dimensions or calculations. A base assembly of 820 mm with a 38 mm worktop contains a 782 mm cabinet including its plinth. Upper cabinet size is separate from mounting elevation.
- #25 double-click remains deferred.

Pricing review: composed tall cabinets now count doors from their actual slot layout. The previous generic door count could omit those fronts and hardware. This correction can change an existing tall cabinet's calculated price; compare representative DELFI tall cabinets before production approval.

This is the whole develop release, including earlier upper-cabinet details, plan/selection/render corrections, mobile/UI foundations and Supplier Bridge improvements. Compared with current main it also adds the existing `0005_user_activity.sql` migration and requires that version for readiness. The migration creates five activity tables and their indexes; it does not rewrite project or catalog rows. After database recovery, check the production migration ledger and obtain approval before applying any missing migration. Rolling the application image back can leave these additive tables in place; do not drop them as part of routine rollback.

## Source and main preservation

The source started at current `origin/develop` in isolated worktrees. The original checkout's unrelated unresolved merge remains untouched.

Delivered through protected PRs to develop: PR145 (layers), PR146 (drag/snapping), PR147 (doors/preset preservation), PR148 (preset creation/previews) and PR149 (height explanations). Read-only validation additionally found the standalone upper-corner template filtering out the door switch; PR152 preserves it and covers that exact package's geometry and BOM. That follow-up requires its own green protected CI before integration.

The production parent is `f4d59af196af8addbddada20d9028e2030f45006`. The old PR117 release was squashed: its source `9dc724a4794e7267ec2ed894c17c1a6bb353d0d9` and main commit `c03d7f85a90950f1256034b14df3325901b18e37` have identical trees. Its develop parent `1b28574ba2f2690b0c48f4307026cecc5bc2e51e` is an ancestor of current develop.

The true main delta from that proven baseline spans six files. Five supplier-bridge/auth files were already incorporated into develop by `b7c90405`, followed by the shared exact-company login contract in `a61c9ecc` and newer preview-color work. Those newer implementations and their regression tests are preserved. The remaining deployment workflow changes retain the production trigger, separate target app/schema/object prefix, existing target preflight and PostgreSQL readiness check. Merge `af2cae96` records main ancestry without reverting current develop features.

## Targeted DELFI package update

The founder explicitly approved calculation only, without writes. All 16 DELFI packages and their catalog references in each environment were processed only in memory on the original server. Only identifiers, hashes, counts and check results returned locally. The final plan selects 12 packages in each environment, leaves four non-applicable packages unchanged, and reports no unresolved references. All existing parameter definitions/defaults, geometry, pricing rules and presets are preserved; the drawer package retains all eight presets. Stored package hashes match their recomputed original content hashes. Dev and prod have separate plan fingerprints and must never share a copied catalog snapshot.

`planClientModuleDoorUpgrade` and the read-only CLI `scripts/planClientModuleDoorUpgrade.ts` prepare exact package IDs. The CLI accepts a scoped snapshot on stdin, checks the requested tenant/schema, validates resulting packages, and prints only IDs, hashes, counts and the plan fingerprint. It cannot connect to or write a database. Run it on the existing host or an explicitly approved private restored copy; do not export customer package payloads implicitly. The private operator review and full per-environment hashes remain outside Git.

The targeted operation:

1. Matches an existing package only to the same trusted runtime builder and module type. Unknown/custom builders require review.
2. Adds the `hasDoors` definition and its UI control/group when absent. Existing false defaults stay false.
3. Preserves every original parameter default, material rule, commercial rule, geometry, placement constraint, identity, asset and client preset. Existing preset IDs win; new system presets are appended through the established merge owner.
4. Recomputes package integrity and updates only `packageHash` in the exact existing catalog entry. It preserves legacy catalog IDs, disabled status, names, sizes and pricing references. Repeating the operation is idempotent.
5. Fails on absent or ambiguous references instead of adding or reassigning client modules. The existing historical `wall_corner_90` catalog type is accepted only for that exact package with the registered wall-cabinet type and trusted builder. The stored catalog identity/type is retained; other type or builder mismatches still fail.

Do not use a wholesale system-template refresh for this release: that existing operation intentionally replaces several client defaults. Do not use broad catalog reconstruction on the live shared host.

Before an approved write: verify an off-host backup and restore evidence, retain the original affected package rows and catalog revision in an approved private backup, and record the before hashes. The eventual write must use one tenant-scoped transaction for the affected packages and catalog hashes, compare current hashes/revisions against the approved plan, and abort on drift. A production database writer is not part of this read-only plan; this document does not authorize data writes, snapshots or migration execution.

## Validation evidence

- Clean dependency installation; typecheck, build and lint pass.
- Final combined release: 390 unit-test files, 2524 passed and one existing skip. The final local run used four workers after two 5-second timeouts under higher concurrency; no assertion, timeout or scenario was relaxed. The standalone corner branch also passed the full default suite (2514 tests, one existing skip).
- Twelve package-refresh/upgrade tests cover exact preservation, false values, hash synchronization, idempotency, the historical corner alias and refused targets. Two additional exact-package geometry/BOM cases cover the standalone upper corner. The existing exact UI-control contract was updated for the new switch.
- The CLI was exercised on a synthetic package and emitted a valid metadata-only plan.
- Production dependency audit: no high or critical production advisories.
- Live GitHub protection for both main and develop requires strict `verify` and `CodeQL` checks, PRs and administrator enforcement; force push/deletion are disabled. Secret scanning, push protection and Dependabot security updates are enabled.
- Release blocker: historical Google API Key alerts 1–3 remain open with no resolution recorded. Provider revocation and the required `revoked` disposition have not been verified. Secret values were not read.
- Full UI validation for the combined preset/height branch passed, including 55 direct-drag, 25 door/height and 26 preset checks, save/load, full FQP and recovery; browser console errors zero.
- The release worktree's independent fresh-runtime full UI run also passed, including save/load, FQP and recovery with zero console errors. The complete UI chain passed again after the exact upper-corner fix. Placement audit passed for nine packages. The tracked secret scan passed. CI for release head `884dac1d76abc4e2ef0d84b49a57afdc6b103ae6` passed; its downloaded CycloneDX 1.5 SBOM parsed successfully with 44 production components. A newer release head must pass its own CI and artifact checks.
- MANUAL_TEST_LOG.csv rows 636–642 contain the non-programmer test paths and package-plan preservation checks. Online founder acceptance is still pending.

The synthetic file-runtime tests do not prove real DELFI pricing/catalog compatibility or recovery of a production backup. Existing protected CI also exercises isolated PostgreSQL restore, authorization, save idempotency, accessibility, dependency policy and CodeQL. Require green results for the exact release head, including its production SBOM artifact.

## Online acceptance and rollback

The founder approved the exact 38 unused managed application images. Fresh inventory checks retained all running/stopped container references, current/previous service images and four latest generations. Exactly those 38 images were removed, without force/prune, container/volume changes or a database restart. PostgreSQL completed recovery automatically at 04:49:19 UTC. The post-cleanup snapshot showed approximately 6.97 GB available and 82% disk use. Develop and production health/readiness returned 200. PR148 then deployed successfully; PR149 subsequently passed strict CI and merged to develop. Online login loaded with zero console errors; an authenticated DELFI workflow has not yet been accepted.

The live production migration ledger contains only 0001-0004; dev includes 0005. Apply the additive 0005 migration only as a separately approved production step before this release. Read-only infrastructure metadata did not reveal an application backup service or a backup-named cron/systemd unit; that narrow check cannot exclude provider-side backups. Verified off-host backup and restore evidence is still required.

Confirm the final deployed develop commit and apply only the separately approved tenant update after its backup requirements are met. Then test with the founder: create a kitchen; insert, drag and snap cabinets in plan and 3D; switch layers; remove/restore doors; save/apply presets; inspect geometry, BOM and price; save and reopen; export and reopen FQP. Include existing projects, upper cabinets, rotated runs, corners and composed tall cabinets.

Before main promotion, complete `docs/release-checklist.md`, including branch protection, secret-alert disposition, exact-head CI/CodeQL/SBOM, schema/backup compatibility and online acceptance. Main merge, live data changes and destructive cleanup each retain their approval requirement.

Rollback: retain the current production image and the approved original DELFI rows/catalog revision before any write. Revert the release through a protected PR and redeploy the retained prior image. Restore only approved affected package/catalog records after comparing their current revision; do not overwrite presets or edits created after the update. Projects, materials, prices and unrelated tenant rows are never bulk replaced. A whole-database restore is a separately approved incident action, not the default rollback.
