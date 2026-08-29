# Kitchen App Architecture

See also:

- `docs/AI_DEVELOPMENT_RULES.md`
- `docs/PROJECT_SAVE_LOAD_CONTRACT.md`

Current app composition rule: do not add feature logic directly into `src/app.ts`. New logic must go into the matching controller/helper file and `app.ts` should only wire it.

## Stack

TypeScript, Three.js, Vite. No UI framework. DOM API for UI.

## Current `src/` Structure

```text
src/
  app/        App controllers, UI workflow glue, layout tools
  core/       Scene, camera, rendering, disposal, export
  data/       Materials, pricing, hardware definitions
  geometry/   Module geometry builder dispatcher
  layout/     App state, history, placement, kitchen context
  materials/  PBR material definitions, UV grain
  model/      Cabinet module shared types
  modules/    Parametric cabinet modules
  rendering/  SSGI pipeline, photo path tracer
  ui/         UI panels and form helpers
  walls2d/    2D wall solver and snapping
```

## Ownership

- `src/modules/`: parametric module implementations.
- `src/geometry/buildModule.ts`: shared module dispatcher. High impact.
- `src/layout/`: production layout, state, history, placement.
- `src/app/`: app workflow controllers and integration glue.
- `src/core/`: shared scene/camera/renderer.
- `src/ui/`: reusable DOM panels and UI helpers.
- `src/walls2d/`: 2D wall solving. High impact.
- `src/server/workerRequestPipeline.ts`: shared HTTP security and observability boundary for both worker entrypoints: compression, request IDs, origin checks, readiness/metrics, auth, budgets, telemetry, audit, and public error mapping.
- `src/server/workerApiRouter.ts`: shared authenticated API dispatch for catalogs, modules, projects, storage, assistant, suppliers, and Blender workflows.
- `src/server/clientCatalogBootstrapEndpoint.ts` and `src/core/catalog/catalog-bootstrap-view.ts`: browser-only catalog bootstrap projection. The legacy/full `/api/catalog`, repository catalog, Supplier Bridge, and server-built project/FQP snapshots remain authoritative and retain supplier provenance; do not move save authority into this projection.
- `src/server/workerRuntimeEnvironment.ts`: shared fail-closed startup contract. Production builds require explicit `dev`/`prod` namespace alignment, PostgreSQL project storage, a database connection, and the matching object-storage prefix before either worker creates repositories.
- `server/workerServer.ts`: production/runtime composition entrypoint. It owns only runtime-specific material-proof asset/reference/color-cache routes and the static frontend fallback around the shared worker owners.
- `src/server/workerServer.ts`: injectable test/development composition entrypoint around the same shared worker owners.
- `server/`: render pipeline and runtime composition, separate from frontend.

## Module Convention

Every cabinet module should live in `src/modules/[name]/` with:

- `geometry.ts`: Three.js mesh construction and module parameters.
- `controls.ts`: UI controls for the module.
- `types.ts`: module-specific TypeScript types.

Register modules through `src/modules/registry.ts`.

## App Composition

`src/app.ts` must stay a composition layer:

- create shared state
- create controllers
- pass dependencies into controllers
- expose wrappers for existing call sites
- start render loop

It should not contain new feature logic. If new logic is needed, place it in a focused controller under `src/app/`.

Current extracted controllers include:

- `buildModeController.ts`
- `buildSelectionController.ts`
- `classicTopbarController.ts`
- `floorBoundaryController.ts`
- `instanceRebuilder.ts`
- `keyboardInputHandlers.ts`
- `kitchenPlacementController.ts`
- `layoutActionsController.ts`
- `measureValueCommitter.ts`
- `moduleAdjacencySnapResolver.ts`
- `moduleSelectionController.ts`
- `pointerInputHandlers.ts`
- `propertiesRouter.ts`
- `selectionController.ts`
- `toolModeController.ts`
- `topbarIcons.ts`
- `transformController.ts`
- `viewPropertiesController.ts`
- `viewModeController.ts`
- `wallController.ts`
- `wallEditHudUpdater.ts`
- `windowControlsController.ts`
- `windowInstanceController.ts`
- `worktopController.ts`

## Shared Type Rule

Only types used across multiple areas should move to shared type files. Feature-specific types stay beside the controller or module that owns them.

## High-Risk Files

Do not modify these casually:

- `src/model/cabinetTypes.ts`
- `src/geometry/buildModule.ts`
- `src/main.ts`
- `src/walls2d/*`

If a change touches these files, keep the commit focused and run the full regression suite.

## Required Checks

For structural changes:

```bash
npm run typecheck
npm test
npm run build
npm run test:project-roundtrip-full
npm run test:ui-regression
```

For UI-affecting changes, also load the app in the browser and verify current console errors are zero.

## Current Refactor Status

Current cleanup direction:

- `src/app.ts` is still above the 3000-line target and must keep shrinking through focused controller slices.
- Feature logic is being moved into focused controllers.
- New controllers should use typed contexts instead of `ctx: any`.
- Worker security/observability and common API routing are consolidated; entrypoint-specific hooks remain explicit instead of duplicating the request pipeline.
- Production worker startup cannot silently fall back to file or in-memory repositories; local, test, and isolated file-storage development remain supported.
- `dist/` build output is not committed as part of refactor commits.

## Full-audit boundary record — 2026-08-23

The codebase trust-boundary inventory is recorded in
`docs/SECURITY_THREAT_MODEL.md`. In particular, the worker API is the
authorization boundary for authenticated tenant context; the browser is never
trusted to choose its tenant identity. Integration, file-import, assistant and
Blender routes must preserve this model. The deployment workflow is also a
trust boundary: it verifies its target and readiness but performs no automatic
destructive CapRover image cleanup. External backup/PITR, database RLS and
central telemetry remain operational controls requiring independent evidence.
