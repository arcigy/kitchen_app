# Module Inspector

`/module-inspector` is a side validation surface for one module at a time.

It intentionally reuses the production runtime:

- module list and geometry: `src/modules/registry.ts`
- FWM packages and parameter schema: `src/system/module-packages`
- catalog defaults, materials, components and prices: `createSystemCatalogSeed`
- kitchen context sync: `applyKitchenContextToModuleParams`
- BOM and quote calculation: each module descriptor `calculateBOM`

The inspector does not store its own module geometry, pricing, or bindings. If a module renders and prices correctly here, the same module runtime path is being exercised as in the main app.

## Supported Checks

- Select any registered module.
- Edit module parameters.
- Apply kitchen group bindings and inspect `fx` binding details per parameter.
- Edit material groups such as Corpus, Fronts, Back, Inner shelves, Drawer bottoms, Plinth, and Worktop as real catalog slots with material and available board thickness.
- Change source kitchen context values used by the bindings.
- Inspect selected 3D part dimensions, material metadata, and influencing parameter keys.
- Hide/show individual meshes.
- Enable a real clipping section box, with optional visible helper.
- Review quote totals and item-level formulas with substituted values.

## Binding Truth Model

The `fx` indicator is populated from `behavior.contextBindings` in the FWM package. The displayed value is not separately calculated in the inspector. Pressing `Apply kitchen bindings` calls `applyKitchenContextToModuleParams`, which uses the same production sync runtime as kitchen groups.

For legacy modules that do not expose package context bindings, the inspector still renders all runtime parameters and uses the production fallback sync code. Those parameters may not have an `fx` marker until the legacy module is migrated to FWM bindings.

Material group edits update the user-facing `*MaterialId` parameter, `materialAssignments`, `commercialSelections.boardMaterials`, and the matching thickness parameter or `commercialSelections.boardThicknesses`. This keeps 3D render colors, board thicknesses, BOM, and pricing on the same selected catalog material.

## Quote Truth Model

The quote panel calls the selected module descriptor's `calculateBOM(params, ctx, catalog)` and displays the returned `pricing.items` and group totals. Item formulas are rendered from the substituted item dimensions, quantities, unit prices, and calculated costs already present in the pricing payload.

The inspector does not maintain a separate price list. Material and component pricing comes from the same catalog seed used by the module runtime.

## Verification

Run:

```bash
npm run typecheck
npm run test:module-inspector
npm run build
```

`test:module-inspector` opens `/module-inspector`, probes all registered modules through the same module build and BOM runtime, verifies every module creates at least one 3D object and returns a numeric quote, then runs UI checks for parameter editing, section clipping, hide/show, part selection, and quote toggling.

## Integration Notes

The UI is isolated under `src/module-inspector`. To integrate the workflow into the main app later, mount the same controller in an internal route/panel and pass the active client catalog and kitchen context instead of the system seed/default context.

Do not duplicate logic from this inspector into production module code. Missing or wrong data should be fixed in the FWM module package, module runtime, catalog, or BOM calculator.
