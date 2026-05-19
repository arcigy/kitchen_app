# FurnQuote Module Package Format

`.fqm` is a FurnQuote Module Package envelope. It is not plain JSON and it is not primarily a user-facing export feature or marketplace artifact. Its job is to move module settings, rules, parameters, defaults, UI metadata, and module-specific assets out of the core app and into portable tenant-scoped family packages.

`.fqp` remains the FurnQuote Project file and stores project state plus snapshots of packages used by that project.

## Core App vs Package

The core app is the trusted interpreter/runtime. It may contain trusted runtime builders, geometry builders, placement engines, rule engines, UI rendering infrastructure, BOM/pricing interpreters, and save/load infrastructure.

The core app should not be the source of truth for a specific module's placement rules, default dimensions, UI controls, material/component slots, or pricing rules. Those belong in `.fqm`.

## Package vs Instance

A module package is the source of truth for a module family:

- metadata and compatibility
- parameters and defaults
- placement, snapping, and constraint rules
- trusted runtime geometry reference or declarative geometry recipe
- material and component slots
- BOM/pricing rules
- UI control definitions
- export/manufacturing metadata
- asset manifest and integrity hash

A module instance is project data only. It references `modulePackageId`, `moduleType`, `packageVersion`, and `packageHash`, then stores instance parameters, placement, and material/component assignments. It does not contain the full package definition.

## File Layers

There are three layers:

- `*.fqm.source.json`: developer authoring template under `src/system/module-packages`.
- `*.fqm`: portable package envelope with magic string, gzip/base64 payload, and SHA-256 hash.
- `module.package.json`: validated unpacked tenant runtime manifest created after seed/import.

Runtime app flow reads tenant `module.package.json` through `/api/modules`. It does not read source templates directly.

## Envelope

The `.fqm` file is a JSON envelope, but its payload is compressed and hashed:

```ts
{
  magic: "FURNQUOTE_MODULE_PACKAGE",
  envelopeVersion: 1,
  packageEncoding: "base64",
  compression: "gzip",
  payloadHash: "sha256...",
  createdAt: "2026-05-19T00:00:00.000Z",
  payload: "base64-gzip-data",
  signature?: {
    algorithm: "HMAC-SHA256",
    keyId: "default",
    value: "hmac..."
  }
}
```

`MODULE_FILE_SECRET` enables optional HMAC verification. It is separate from `PROJECT_FILE_SECRET` and is never a frontend secret.

## Payload

The decoded gzip payload has this shape:

```ts
{
  payloadType: "furnquote-module-package",
  payloadVersion: 1,
  exportedAt: string,
  modulePackage: FurnQuoteModulePackage,
  bundledAssets: ModulePackageBundledAsset[]
}
```

Bundled assets are base64 encoded and validated with SHA-256, MIME allowlist, size, count, and safe filename checks.

## Security Model

`.fqm` packages do not import or execute JavaScript or TypeScript. The importer accepts JSON data, validates it, hashes it, and stores it under the current client.

Complex geometry uses `geometry.mode = "trusted-runtime"` with a `runtimeBuilderKey`, for example `drawerLow.v1`. That key points to built-in application code already present in the trusted runtime registry. The package configures the builder; it does not ship executable code.

## Storage

Tenant packages are stored per client:

```txt
storage/
  clients/
    {clientId}/
      catalog/
        modules/
          {modulePackageId}/
            module.fqm
            module.package.json
            module.meta.json
            assets/
```

All repository reads and writes use `ClientContext.clientId`. Client A cannot list or read Client B packages.

System source templates live under `src/system/module-packages/*.fqm.source.json`. They are seed inputs only. When a client catalog is created or repaired, source templates are packed through the `.fqm` codec, copied into that client's tenant storage, unpacked as `module.package.json`, and referenced from `catalog.modules`.

## ClientCatalog Integration

Admin/dev import flow:

1. Parse `.fqm` envelope.
2. Validate magic, envelope version, compression, payload encoding, and payload hash.
3. Gunzip/decode payload.
4. Validate payload type/version, module package, assets, compatibility, and trusted builder keys.
5. Store the original envelope as `module.fqm`.
6. Store the validated runtime manifest as `module.package.json`.
7. Restore bundled assets under `assets/`.
8. Store `module.meta.json`.
9. Add or update `catalog.modules` with `modulePackageId`, `packageVersion`, `packageHash`, `runtimeBuilderKey`, defaults, category, tags, and `enabled`.

UI availability is driven by `ClientCatalog.modules.enabled`. A trusted runtime builder may exist globally, but a module is visible only when the client catalog enables that package/module.

App bootstrap flow:

```txt
session
-> ClientContext
-> ClientCatalog
-> GET /api/modules
-> app composition with clientCatalog + tenant modulePackages
```

## Placement Rules

The package owns placement behavior through `placement.allowedContexts`, anchors, wall/floor/corner requirements, clearances, and collision hints. The app interprets these rules with `validateModulePlacement`.

Corner modules define `allowedContexts: ["kitchen_corner"]`, require `two_perpendicular_walls`, set `requiresCorner`, and can restrict `corner.allowedAngles` with tolerance. Invalid context, missing second wall, wrong angle, or missing wall/floor anchor returns explicit placement errors.

## Slots

Material slots declare required material roles and default catalog paths such as `catalog.kitchenDefaults.frontMaterialId`. Component slots do the same for handles, hinges, runners, and other supported component roles. Resolution uses `ClientCatalog`; packages do not hardcode global material fallbacks.

## Context Bindings

Packages can declare which higher-level context owns the module. For kitchen modules this is encoded in `behavior.contextBindings`:

```ts
{
  contextType: "kitchenGroup",
  required: true,
  scope: "single",
  autoAssign: "activeKitchenGroup",
  liveSync: true,
  forbidCrossContextAdjacency: true,
  parameterSync: [...],
  materialSync: [...],
  componentSync: [...],
  commercialSelectionSync: [...]
}
```

This is where the package says that a module must belong to exactly one kitchen group and should be auto-assigned to the active kitchen group on creation. Core code interprets this DSL; it does not need a module-specific branch for `cornerShelfLower`.

`parameterSync` maps package parameters from context values, for example `height <- ctx.heightMm`, `heightCarcass <- ctx.moduleHeightMm`, `depth <- ctx.moduleDepthMm`, plinth settings, and worktop thickness.

`materialSync` maps material slots and legacy runtime material fields from the owning context, for example carcass/body from `ctx.corpusMaterialId`, front from `ctx.frontsMaterialId`, back from `ctx.backMaterialId`, and drawer bottom from `ctx.drawerBottomMaterialId`.

`componentSync` maps component slots from context values, for example handle assignment from `ctx.handleComponentId`, and can apply safe built-in transforms such as `handleGeometryKind` and `componentNominalLength`.

`commercialSelectionSync` lets a module-specific material snapshot populate BOM/commercial board selections from the same context material assignments.

The context binding model is declarative. It allows new module families to define different ownership, sync, material, component, and commercial behavior without importing arbitrary JavaScript.

## Project Snapshots

When a project uses a module package, `.fqp` can store `catalogSnapshot.usedModulePackageSnapshots`:

```ts
{
  modulePackageId,
  moduleType,
  packageVersion,
  packageHash,
  packageSnapshot
}
```

This lets an old project reopen even if the current client catalog no longer has the package or has a newer version. The resolver can report that a package exists but changed, is missing and loaded from project snapshot, or has a hash mismatch.

## Migration Status

Current state:

- `.fqm` framework: done
- first real corner module fixture/package: done for `cornerShelfLower` as `corner_shelf_lower_family_v1`
- system `.fqm` templates: done for the current built-in kitchen modules
- tenant package seeding: done for new file-backed client catalogs
- app bootstrap package loading: done through `/api/modules`
- `.fqm` envelope codec: done with gzip/base64 payload and SHA-256 hash
- API registration: done in `src/server/workerServer.ts` and root `server/workerServer.ts`
- UI module list source: done for the kitchen module picker through `ClientCatalog.modules` plus tenant packages
- package-driven controls: done for build mode and selected module properties through `package.ui.controls` and `package.parameters`
- placement rule integration: done for kitchen placement paths that receive tenant packages; debug module insertion now requires a package instead of descriptor defaults
- package-driven context bindings: done for current kitchen module templates through `behavior.contextBindings`
- runtime builder integration: done through trusted runtime builder keys
- `.fqp` package snapshot restore: partial/done at typed resolver level; UI warning display is still TODO

Module status:

- `drawerLow`: system `.fqm` template done; geometry remains trusted `drawerLow.v1`
- `swingShelvesLow`: system `.fqm` template done; geometry remains trusted `swingShelvesLow.v1`
- `cornerShelfLower`: system `.fqm` template done; geometry remains trusted `cornerShelfLower.v1`
- `fridgeTall`: system `.fqm` template done; geometry remains trusted `fridgeTall.v1`
- `flapShelvesLow`: system `.fqm` template done; geometry remains trusted `flapShelvesLow.v1`

Remaining TODO:

- Descriptor-specific controls/defaults remain in `src/modules/registry.ts` for trusted builder compatibility, direct module tests, and old compatibility paths. They are no longer the normal build/selected-module UI path when a tenant package is available.
- Normalize the lower-level geometry/validation fallbacks so trusted builders receive package defaults without relying on descriptor defaults internally.
- Add UI warning display for project loads restored from `.fqp` package snapshots.

## Authoring References

Use these documents when creating new modules:

- `docs/module-authoring-ai-guide.md`: full AI workflow and package design rules.
- `docs/module-authoring-checklist.md`: acceptance checklist before marking a module ready.
- `docs/module-package-source-template.md`: copyable `.fqm.source.json` skeleton.
