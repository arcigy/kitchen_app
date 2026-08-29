# Module Authoring Checklist

Use this checklist before saying a new module is ready.

## Identity

- [ ] `modulePackageId` is unique and stable.
- [ ] `moduleType` matches the trusted runtime builder expectation.
- [ ] IDs use normalized product naming: lowercase snake case, no client/supplier prefix, no `family`, no version suffix.
- [ ] `familyName` and `displayName` are human-readable.
- [ ] `category` is one of the allowed package categories.
- [ ] `version` is set.
- [ ] Tags describe real usage, such as `kitchen`, `corner`, `base`, `wall`, `wardrobe`.

## Parameters

- [ ] Every variable module value is represented in `parameters.parameters`.
- [ ] Parameter keys are unique.
- [ ] Required parameters have defaults or are intentionally provided by instance creation.
- [ ] Number parameters have sensible `min`, `max`, `step`, and `unit`.
- [ ] Select parameters have `options`.
- [ ] Material and component parameters are backed by slots where applicable.
- [ ] `type` parameter exists and defaults to `module.moduleType`.

## UI

- [ ] Every `ui.controls[*].parameterKey` exists in parameters.
- [ ] Controls use supported `controlType` values.
- [ ] Groups are ordered.
- [ ] Labels are in the package, not hardcoded in TypeScript.
- [ ] Picker name/category/icon come from package metadata/UI.

## Placement

- [ ] `placement.allowedContexts` is not empty.
- [ ] Anchors are explicit.
- [ ] Wall/floor/corner requirements are explicit.
- [ ] `allowFreePlacement` is intentional.
- [ ] Corner modules require `two_perpendicular_walls`, `corner`, and allowed angle/tolerance.
- [ ] Collision policy is explicit.
- [ ] Snapping targets and priority match placement rules.

## Context Binding

- [ ] Module ownership is declared in `behavior.contextBindings` if it belongs to a context.
- [ ] Kitchen modules use `contextType: "kitchenGroup"` when they depend on kitchen settings.
- [ ] Required single ownership uses `required: true` and `scope: "single"`.
- [ ] Auto assignment is explicit, such as `activeKitchenGroup`.
- [ ] `liveSync` is intentional.
- [ ] Cross-context adjacency is forbidden when the module cannot span multiple contexts.
- [ ] All `parameterSync.targetParameter` keys exist in parameters.
- [ ] All `materialSync.targetSlot` keys exist in materials.
- [ ] All `componentSync.targetSlot` keys exist in components.
- [ ] Sources use only `ctx.*`, `catalog.*`, or `constant.*`.
- [ ] Transforms are supported by the interpreter.

## Materials

- [ ] Material slots are declared for every required material role.
- [ ] Slot IDs are unique.
- [ ] `defaultFrom` uses catalog defaults or `none`.
- [ ] Allowed tags/families are realistic.
- [ ] Context material sync pulls from the owning context when needed.
- [ ] Thickness parameters are synced where geometry needs them.
- [ ] Legacy aliases are used only to feed existing trusted builders.

## Components

- [ ] Component slots are declared for handles, hinges, runners, legs, rails, LEDs, or other components.
- [ ] Slot IDs are unique.
- [ ] Component types are valid.
- [ ] Context component sync pulls from the owning context when needed.
- [ ] Component-derived geometry values use supported transforms.

## Geometry

- [ ] `geometry.mode` is either `trusted-runtime` or supported `declarative`.
- [ ] `runtimeBuilderKey` exists when using trusted runtime.
- [ ] Package parameters cover all builder inputs.
- [ ] Overlap checks use the same real profile/volume detector as the inspector, not only a full `Box3`/AABB rectangle.
- [ ] Non-rectangular modules expose real plan silhouettes for selection, CSV, BOM, placement, and overlap tests.
- [ ] No executable code is stored in the package.
- [ ] No `eval`, `Function`, dynamic import, or script field is required.

## BOM And Pricing

- [ ] BOM rules are declarative.
- [ ] Rule IDs are unique.
- [ ] Formulas reference existing parameters/slots.
- [ ] Pricing references catalog data.
- [ ] No package code computes prices.

## Assets

- [ ] Asset filenames are safe.
- [ ] No path traversal.
- [ ] MIME types are allowed.
- [ ] Asset sizes are inside limits.
- [ ] Icons/previews referenced by UI exist in `assets.files` or are intentionally absent.

## Tenant And Catalog

- [ ] System template can seed tenant storage.
- [ ] Tenant storage contains `module.fqm`, `module.package.json`, `module.meta.json`, and `assets/`.
- [ ] `catalog.modules` references `modulePackageId`, version/hash, builder key, and enabled status.
- [ ] Disabled module does not show in UI.
- [ ] Client A cannot see Client B package.

## Project Save

- [ ] New module instances include `modulePackageId`.
- [ ] Instances include `packageVersion` and `packageHash`.
- [ ] Parameters survive `.fqp` roundtrip.
- [ ] Placement survives `.fqp` roundtrip.
- [ ] Material/component assignments survive `.fqp` roundtrip.
- [ ] `.fqp` includes used package snapshot.
- [ ] Missing current package can restore from snapshot with warning.

## Manual Smoke

- [ ] Edit tenant `module.package.json` display name; picker updates.
- [ ] Edit tenant default width/height/depth; new instance uses new default.
- [ ] Edit tenant parameter label; properties panel updates.
- [ ] Edit tenant placement rule; insertion behavior changes.
- [ ] Set catalog module `enabled: false`; picker hides it.
- [ ] Save/load keeps module package reference.

## Required Commands

Run after implementation:

```bash
npm run typecheck
npm test
npm run build
npm run test:ui-regression
```

For UI-affecting changes, open the app and confirm console errors are zero.
