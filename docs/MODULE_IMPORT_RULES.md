## Portable Module Import Rules

Portable modules imported from `.modpkg` must keep these layers aligned:

- `src/modules/<module>/package`
- `src/modules/<module>/types.ts`
- `src/modules/<module>/controls.ts`
- `src/modules/<module>/geometry.ts`
- `src/modules/<module>/calculation.ts`
- `src/layout/kitchenMaterialSync.ts`
- `src/modules/runtime/portableControls.ts`
- `src/modules/runtime/portableGeometry.ts`
- `src/modules/runtime/portableCommercial.ts`
- `src/modules/registry.ts`

### Kitchen module minimum rules

- `assemblyContext = kitchen` must imply:
  - `supportsKitchenContextDimensions = true`
  - `supportsKitchenContextMaterials = true`
- `requiresWorktop = true` must imply `hasWorktop = true`
- controls must run the module normalizer after every param edit
- UI selector params must also resolve in runtime pricing:
  - `handleComponentId`
  - `legComponentId`
  - `runnerComponentId`
  - `hingeComponentId`
  - `clipComponentId`

### Corner-specific rules

- plan span is `lengthX x lengthZ`
- structural arm depth is `depth`
- runtime import code must not treat `depth` as the full Z footprint
- kitchen sync must update:
  - `height`
  - `heightCarcass`
  - `depth`
  - board/front/back materials
  - commercial board slot selections

Live corner mesh names must map back to canonical slot ids:

- `side_end_x -> left-side`
- `side_end_z -> right-side`
- `back_x -> back-panel-x`
- `back_z -> back-panel-z`
- `back_corner_panel -> back-corner-panel`
- `bottom_x -> bottom-panel-x`
- `bottom_z -> bottom-panel-z`
- `top_x_front -> top-panel-x-front`
- `top_x_back -> top-panel-x-back`
- `top_z -> top-panel-z`
- `kick_x -> plinth-x`
- `kick_z -> plinth-z`
- `shelf_n_x -> shelf-n-x`
- `shelf_n_z -> shelf-n-z`
- `door_front_x -> door-front-x`
- `door_front_z -> door-front-z`

### Reimport safety

Reimport must refresh package files, but it must preserve handwritten adapter files if they already exist:

- `types.ts`
- `controls.ts`
- `geometry.ts`
- `calculation.ts`

That keeps custom drawer/corner runtime wiring intact when a newer `.modpkg` is imported.
