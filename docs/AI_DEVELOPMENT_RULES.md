# AI development rules

These rules are mandatory for future AI or human changes in this repository.

## Main rule

Do not add new feature logic directly into `src/app.ts`.

`src/app.ts` is only the application composition layer:

- create shared state
- wire controllers together
- mount top-level UI
- start render loop
- expose small wrapper functions when older code still needs them

If a change needs more than a small wiring edit, create or update a focused file under `src/app/`, `src/layout/`, `src/ui/`, `src/modules/`, or `src/core/`.

## Where code belongs

| Area | Correct location |
| --- | --- |
| Topbar buttons and ribbons | `src/app/*Topbar*.ts` or `src/app/topbarIcons.ts` |
| Layout actions such as duplicate, delete, underlay, 2D toggle | `src/app/layoutActionsController.ts` |
| Properties panel routing | `src/app/propertiesRouter.ts` |
| Active view properties text | `src/app/viewPropertiesController.ts` |
| Floor boundary editing | `src/app/floorBoundaryController.ts` |
| Wall drawing, snapping, wall mesh updates | `src/app/wallController.ts` |
| Worktop drawing and worktop group updates | `src/app/worktopController.ts` |
| Kitchen module placement | `src/app/kitchenPlacementController.ts` |
| Module hit-testing and floorplan selection | `src/app/moduleSelectionController.ts` |
| Pointer and keyboard events | `src/app/pointerInputHandlers.ts`, `src/app/keyboardInputHandlers.ts` |
| Tool modes, Escape behavior, wall/measure/dimension activation | `src/app/toolModeController.ts` |
| Layout object selection state | `src/app/selectionController.ts` |
| Build-mode rebuild and build controls | `src/app/buildModeController.ts` |
| Module transforms | `src/app/transformController.ts` |
| Module rebuilds | `src/app/instanceRebuilder.ts` |
| Build-mode part selection | `src/app/buildSelectionController.ts` |
| Window model creation and clamp rules | `src/app/windowInstanceController.ts` |
| Window UI controls | `src/app/windowControlsController.ts` |
| Module geometry | `src/modules/[module]/geometry.ts` |
| Module UI controls | `src/modules/[module]/controls.ts` |
| Shared material/pricing data | `src/data/` |

For every new icon-bearing UI action, also follow `docs/ui-icon-contract.md`.

## Before adding code

1. Identify the feature area from the table above.
2. Search for an existing controller/helper for that area.
3. Extend that file if the responsibility matches.
4. Create a new focused file only when no existing owner fits.
5. Keep `app.ts` changes to imports, context wiring, and wrappers.

## Feature planning directive

Before implementing a new feature, first write down the system owner and the smallest safe implementation path. Do not start by adding code to the nearest event handler.

For each feature, confirm:

- which existing system owns it;
- which existing controller/helper already has similar behavior;
- which Universal Editor capabilities are involved, if any;
- which current behavior needs characterization tests before refactoring;
- which new behavior needs focused tests;
- which manual app path belongs in `MANUAL_TEST_LOG.csv`;
- which files are intentionally out of scope.

If the owner is unclear, stop at analysis and add tests or a wrapper first. Do not create a second custom implementation beside an existing one.

## Universal editor directive

Read and follow `docs/universal-editor-contract.md` before touching editor-wide behavior:

- selection and deselection;
- delete, duplicate, copy, move, pointer drag, transform move, and align;
- trim and extend;
- dimensions and temporary dimensions;
- undo and redo;
- keyboard shortcuts;
- editor topbars, toolbars, and mode shells.

Editor behavior must move toward shared commands, capability profiles, and tested adapters. Do not add entity-specific shortcuts unless the Universal Editor Contract says the entity should be special.

## Commit hygiene directive

Every non-trivial slice should be independently reviewable:

- one behavior area per commit;
- focused tests before or with the change;
- `MANUAL_TEST_LOG.csv` row for user-verifiable behavior;
- no `dist/` output;
- no package/config churn unless the task requires it;
- no unrelated formatting or line-ending normalization.

## Hard limits

- Do not grow `src/app.ts` unless there is no smaller safe option.
- Keep `src/app.ts` below 3000 lines. If a task would increase it, extract a focused controller first.
- Do not put business logic in event-handler wiring.
- Do not mix unrelated refactors in one commit.
- Do not move code and change behavior in the same step.
- Do not add new frameworks or test libraries without a separate decision.
- Do not commit generated build output unless the release process explicitly requires it.
- Do not commit secrets, `.env` values, API keys, tokens, or private customer data.

## Controller contracts

- New controllers must declare an explicit context type.
- Do not use `Record<string, any>` for controller dependencies.
- If a controller needs shared state, pass only the fields it uses.
- Prefer typed getters/setters when the value is initialized later in `app.ts`.
- Keep feature-specific types beside the controller that owns them.
- Export a type only when another module genuinely consumes it.

## Project save/load contract

Read and follow `docs/PROJECT_SAVE_LOAD_CONTRACT.md` before adding or changing any persisted project state, module parameters, layout entities, database project storage, import/export, recent activity, BOM/pricing snapshots, or restore logic.

Any new user-visible state must be serialized, restored, validated, and asserted in the project roundtrip tests.

## Required checks after structural changes

Run at minimum:

```bash
npm run typecheck
npm test
npm run build
npm run test:project-roundtrip-full
npm run test:ui-regression
```

For UI-affecting changes, also load the app in the browser and check current console errors.

## Refactor checklist

- Behavior was copied first, then moved.
- Public function names stayed stable or wrappers were left in place.
- The old workflow is covered by an existing test or a browser check.
- `src/app.ts` line count did not increase.
- If `src/app.ts` changed, the final line count is recorded in the PR/commit notes.
- New files have one clear responsibility.
- The final diff does not include unrelated files.
