# Kitchen Performance Patch Notes

Scope for manual refactor carry-over:

- `src/layout/kitchenEditMode.ts`
  - Replaced large material and handle `<select>` controls with exact-ID lookup inputs.
  - Lookup first calls `/api/catalog/lookup`; local catalog matching is only a dev/static fallback.
  - Number inputs commit on `change`/Enter only, coalesce rapid kitchen context edits, and do not remount the properties panel.
  - Inactive kitchen group preview no longer clones every mesh material.
  - Kitchen ribbon prewarms module geometry in the background so the first real insert does not hit the cold path.
- `src/app/instanceRebuilder.ts`
  - Added `skipLayoutPanelUpdate` and avoids neighbor/layout validation work when `skipLayoutValidation` is true.
- `src/app/kitchenPlacementController.ts`
  - Kitchen group context rebuilds update the layout panel once at the end.
  - Modules are rebuilt only when their package context bindings read a changed `ctx.*` key.
  - Worktops are rebuilt only when a changed context key actually affects worktop geometry/material.
- `src/app/worktopController.ts`
  - Worktop material is replaced only when `materialId` changes; dimension-only edits no longer recreate `MeshStandardMaterial`.
- `src/layout/placementManager.ts`, `src/layout/appState.ts`, `src/app.ts`, `src/app/pointerInputHandlers.ts`
  - Placement ghost rebuild is scheduled through `requestAnimationFrame` for pointer moves.
  - Ghost material cloning is cached per ghost instance.
- `src/system/module-packages/extendedFurniture.ts`
  - Plinth context/material bindings are emitted only for FWM modules that actually have a plinth.
- `src/server/workerServer.ts`, `server/workerServer.ts`
  - Added `/api/catalog/lookup?kind=material|component&id=...` for exact backend catalog lookup.
  - The app dev worker runs through `server/workerServer.ts`; keep this route in both server entrypoints until the duplicate worker split is removed.
- `src/server/workerServer.test.ts`
  - Covers exact material lookup and board-family rejection.
- `vite.config.ts`
  - Vite proxy now reads `BLENDER_WORKER_PORT`, so isolated performance runs can target a fresh worker.
- `scripts/testKitchenPerformance.mjs`
  - Adds a repeatable browser verifier for exact backend lookup, properties DOM size, group edit, module button insert, placement ghost movement, and shared kitchen context edits.
  - Tracks browser `longtask` entries during delayed rebuild windows so async jank over the 500 ms guard fails the test.

Measured after the patch on isolated `http://127.0.0.1:5200/` / worker `5298`:

- Properties DOM: 512 elements, 1 option element.
- Real kitchen edit workflow: edit group 11 ms, FWM drawer button 11 ms, scheduled ghost move 74 ms.
- Shared kitchen context edits: dispatched number input/change handlers returned within the 500 ms guard.
- Delayed rebuild windows for edit group, insert, upper changes, and worktop depth had 0 browser long tasks.
- Auto-U visual scenario: 24 modules created in 225 ms, no console errors.

Follow-up audit on `http://127.0.0.1:5185/`:

- Environment issue found: the UI was served from this worktree, but worker `5191` was still running from `C:\Users\laube\Documents\GitHub\kitchen_app`. Restarting the worker from this worktree restored the current `/api/catalog/lookup` route.
- CPU profile of module placement showed the freeze was not mesh generation. The hot path was dynamic properties UI: full catalog material/component `<option>` creation plus global DOM i18n translation.
- `src/core/module-package/runtime/module-package-controls.ts` now skips global DOM i18n for generated package controls, translates labels directly, and renders material/component package parameters as lightweight text ID inputs instead of full-catalog selects.
- `src/app/modulePlacementHelpers.ts` caches floorplan adjacency lines by view and module world boxes instead of recreating all adjacency geometry/materials every frame.
- `src/app/technicalDimensions.ts` now avoids canvas sizing/clearing work outside active 2D floorplan dimension rendering.

Measured after the follow-up patch on `http://127.0.0.1:5185/`:

- Before fix: first module placement produced a `maxLongTaskMs` around 5872-6085 ms; second placement around 5416 ms; synthetic 3D orbit around 9688 ms.
- After fix: edit group 16 ms, drawer insert button 34 ms, first placement dispatch 38 ms with max long task 108 ms, second placement dispatch 33 ms with max long task 52 ms, synthetic 3D orbit dispatch 14 ms with max long task 151 ms.
- Properties DOM before selecting modules remains light: 512 elements, 1 option, 19 inputs, 1 select.
