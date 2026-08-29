# AI Guide: Creating FurnQuote Module Families

Use this guide when an AI agent creates or migrates a module. The goal is always the same: keep the core platform generic, and put module-specific rules into `.fqm`.

## Principle

Core platform owns only generic engines:

- trusted runtime builders
- placement and snapping interpreters
- context binding interpreter
- UI renderer for package controls
- BOM/pricing interpreter
- ClientCatalog loading
- `.fqp` save/load and package snapshots

The module package owns module-specific behavior:

- names, category, tags
- parameters and defaults
- UI controls and labels
- placement, snapping, constraints
- required context, such as `kitchenGroup`
- live sync from context
- material and component slots
- BOM/pricing rules
- runtime builder key
- assets and manufacturing metadata

Do not add `if (moduleType === "...")` to core flow for normal module behavior. If a module needs behavior, first model it in `.fqm`.

## File Targets

Developer-authored source templates:

```txt
src/system/module-packages/{moduleName}.fqm.source.json
```

Runtime tenant storage after seed/import:

```txt
storage/clients/{clientId}/catalog/modules/{modulePackageId}/
  module.fqm
  module.package.json
  module.meta.json
  assets/
```

The app reads tenant `module.package.json` through `/api/modules`. It must not use source templates as runtime source of truth except during seed/dev setup.

## Module Authoring Workflow

1. Choose stable IDs:
   - `modulePackageId`: unique normalized package ID, for example `base_corner`.
   - `moduleType`: stable normalized runtime type, for example `base_corner`.
   - `runtimeBuilderKey`: trusted builder key, for example `baseCorner.v1`.
   - Never include a client/supplier prefix such as `delfi`, `pino`, or `fwm`.
   - Never include `family` or a version suffix in `modulePackageId`; use `module.version` for versioning.

2. Create or update `*.fqm.source.json`.

3. Define every user-facing or business rule in the package:
   - Do not hide defaults in TypeScript.
   - Do not hardcode material choices in runtime code.
   - Do not create descriptor-specific UI factories for normal package controls.

4. Validate:
   - package schema
   - trusted runtime builder key
   - parameter/control references
   - material/component slots
   - behavior context bindings
   - placement and snapping rules

5. Seed/import package into tenant storage.

6. Verify runtime behavior by editing tenant `module.package.json`:
   - display name changes in picker
   - default parameter changes new instance
   - UI label changes properties panel
   - placement rules affect insertion
   - disabled catalog module disappears

## Required Package Sections

Every module package must contain:

```txt
format
packageVersion
module
parameters
placement
constraints
snapping
geometry
materials
components
ui
assets
compatibility
integrity
```

Use optional sections when applicable:

```txt
behavior
bom
pricing
exports
manufacturing
```

For production modules, `behavior` should be present whenever the module belongs to a higher-level owner such as a kitchen, wardrobe, room, or custom context.

## Parameters

Every runtime value that can vary by family must be a package parameter.

Rules:

- Include `type` with default equal to `module.moduleType`.
- Keys must be unique.
- Required parameters need defaults unless supplied by instance creation.
- Number parameters need `min`, `max`, `step`, and `unit` where possible.
- `ui.controls[*].parameterKey` must reference an existing parameter.
- Context-synced target parameters must exist in `parameters.parameters`.

Examples:

```json
{
  "key": "width",
  "label": "Width",
  "type": "number",
  "required": true,
  "defaultValue": 800,
  "min": 300,
  "max": 1200,
  "step": 50,
  "unit": "mm",
  "group": "dimensions",
  "affects": "geometry"
}
```

## Placement

Placement must be declared by the module package. Core should only interpret the rules.

Wall module:

```json
{
  "allowedContexts": ["kitchen_wall"],
  "requiredAnchors": ["wall", "floor"],
  "requiresWall": true,
  "requiresFloor": true,
  "allowFreePlacement": false
}
```

Corner module:

```json
{
  "allowedContexts": ["kitchen_corner"],
  "requiredAnchors": ["two_perpendicular_walls", "corner", "floor"],
  "requiresCorner": true,
  "requiresWall": true,
  "requiresFloor": true,
  "allowFreePlacement": false,
  "corner": {
    "required": true,
    "allowedAngles": [90],
    "toleranceDeg": 5,
    "mustTouchBothWalls": true
  },
  "collision": {
    "allowOverlap": false
  }
}
```

Free-standing module:

```json
{
  "allowedContexts": ["free_standing", "floor"],
  "requiredAnchors": ["floor"],
  "requiresFloor": true,
  "allowFreePlacement": true
}
```

## Context Bindings

Use `behavior.contextBindings` when a module must belong to a higher-level context.

Kitchen example:

```json
{
  "behavior": {
    "contextBindings": [
      {
        "contextType": "kitchenGroup",
        "required": true,
        "scope": "single",
        "autoAssign": "activeKitchenGroup",
        "liveSync": true,
        "forbidCrossContextAdjacency": true,
        "parameterSync": [
          { "targetParameter": "height", "source": "ctx.heightMm" },
          { "targetParameter": "heightCarcass", "source": "ctx.moduleHeightMm" },
          { "targetParameter": "depth", "source": "ctx.moduleDepthMm" },
          { "targetParameter": "plinthHeight", "source": "ctx.plinthHeightMm" },
          { "targetParameter": "plinthSetbackMm", "source": "ctx.plinthDepthMm" },
          {
            "targetParameter": "worktopThicknessMm",
            "source": "ctx.worktopThicknessMm",
            "transform": "resolvedWorktopThickness"
          }
        ],
        "materialSync": [
          {
            "targetSlot": "carcass",
            "source": "ctx.corpusMaterialId",
            "family": "body",
            "thicknessParameter": "boardThickness",
            "aliases": ["body", "shelf"]
          },
          {
            "targetSlot": "front",
            "source": "ctx.frontsMaterialId",
            "family": "front",
            "thicknessParameter": "frontThicknessMm",
            "aliases": ["front"]
          }
        ],
        "componentSync": [
          {
            "targetSlot": "handle",
            "targetParameter": "handleComponentId",
            "source": "ctx.handleComponentId",
            "componentType": "handle",
            "transforms": ["handleGeometryKind", "componentNominalLength"]
          }
        ],
        "commercialSelectionSync": [
          { "source": "materialSnapshot" }
        ],
        "overridePolicy": {
          "allowUserOverride": false,
          "warnWhenDetachedFromContext": true
        }
      }
    ]
  }
}
```

Supported `contextType` values:

- `kitchenGroup`
- `wardrobeGroup`
- `room`
- `custom`

Supported source prefixes:

- `ctx.*`
- `catalog.*`
- `constant.*`

Supported transforms:

- `identity`
- `materialDefaultThickness`
- `resolvedWorktopThickness`
- `handleGeometryKind`
- `componentNominalLength`

If a new module needs another general transform, add it to the interpreter only when it is reusable across module families. Do not add a one-off module branch.

## Materials And Components

Declare slots first, then sync or assign them.

Material slot example:

```json
{
  "slotId": "front",
  "label": "Front material",
  "required": true,
  "defaultFrom": "catalog.kitchenDefaults.frontMaterialId",
  "allowedMaterialTags": ["front"],
  "affects": ["visual", "bom", "pricing"]
}
```

Component slot example:

```json
{
  "slotId": "handle",
  "label": "Handle",
  "componentType": "handle",
  "required": false,
  "defaultFrom": "catalog.kitchenDefaults.defaultHandleComponentId",
  "affects": ["geometry", "visual", "bom", "pricing"]
}
```

Rules:

- Slots use catalog references, not global hardcoded fallbacks.
- Context material sync can populate `materialAssignments`.
- Context component sync can populate `componentAssignments`.
- Trusted builders receive resolved parameters and assignments.

## Geometry

Use trusted runtime builders for complex modules:

```json
{
  "mode": "trusted-runtime",
  "runtimeBuilderKey": "drawerLow.v1"
}
```

The package may configure the builder with parameters, rules, and slots. It must not ship executable code.

Only use `declarative` geometry when the current interpreter supports the needed primitives. Do not invent executable script fields.

## UI

Properties panels and module pickers must be generated from package metadata:

- picker label: `module.displayName`
- picker category: `module.category`
- icon: `ui.icon`
- controls: `ui.controls`
- labels/types/defaults: `parameters.parameters`

If a UI control needs special rendering, first check whether one of these control types fits:

- `number`
- `select`
- `checkbox`
- `materialPicker`
- `componentPicker`

Do not add descriptor-specific control factories unless it is a legacy compatibility path.

## BOM And Pricing

Use declarative rules:

```json
{
  "id": "front-area",
  "itemType": "material",
  "source": "materialSlot",
  "sourceKey": "front",
  "quantityFormula": {
    "type": "area",
    "widthParam": "width",
    "heightParam": "height"
  }
}
```

Allowed formula types:

- `fixed`
- `area`
- `length`
- `count`

Pricing must reference catalog data. Do not calculate prices with arbitrary package code.

## Import And Seed

System templates are seed inputs:

```txt
src/system/module-packages/*.fqm.source.json
```

Seed/import writes tenant package storage:

```txt
module.fqm
module.package.json
module.meta.json
assets/
```

Runtime reads tenant manifests, not system templates. To verify this, edit tenant `module.package.json`; UI and behavior should change after reload without TypeScript changes.

## Tests Required For New Modules

Add or update tests for:

- package validation
- runtime builder key exists
- UI list uses ClientCatalog plus tenant packages
- disabled module is hidden
- default parameter creates new instance correctly
- properties panel label comes from package
- placement uses package rules
- context binding syncs expected parameters
- material slots resolve through ClientCatalog
- component slots resolve through ClientCatalog
- `.fqp` save includes package snapshot
- load can restore from package snapshot
- no eval, no dynamic import, no executable package script

## Acceptance Test

A new module is correctly package-driven when this passes:

```txt
edit tenant module.package.json
-> reload app
-> module picker/name/UI/defaults/placement/context sync change
-> no TypeScript code change needed
```

If this fails, core still owns something that belongs in `.fqm`.
