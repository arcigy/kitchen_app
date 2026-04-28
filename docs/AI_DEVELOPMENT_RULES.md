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
| Properties panel routing | `src/app/propertiesRouter.ts` |
| Floor boundary editing | `src/app/floorBoundaryController.ts` |
| Wall drawing, snapping, wall mesh updates | `src/app/wallController.ts` |
| Worktop drawing and worktop group updates | `src/app/worktopController.ts` |
| Kitchen module placement | `src/app/kitchenPlacementController.ts` |
| Pointer and keyboard events | `src/app/pointerInputHandlers.ts`, `src/app/keyboardInputHandlers.ts` |
| Tool modes, Escape behavior, wall/measure/dimension activation | `src/app/toolModeController.ts` |
| Layout object selection state | `src/app/selectionController.ts` |
| Build-mode rebuild and build controls | `src/app/buildModeController.ts` |
| Module transforms | `src/app/transformController.ts` |
| Module rebuilds | `src/app/instanceRebuilder.ts` |
| Build-mode part selection | `src/app/buildSelectionController.ts` |
| Module geometry | `src/modules/[module]/geometry.ts` |
| Module UI controls | `src/modules/[module]/controls.ts` |
| Shared material/pricing data | `src/data/` |

## Before adding code

1. Identify the feature area from the table above.
2. Search for an existing controller/helper for that area.
3. Extend that file if the responsibility matches.
4. Create a new focused file only when no existing owner fits.
5. Keep `app.ts` changes to imports, context wiring, and wrappers.

## Hard limits

- Do not grow `src/app.ts` unless there is no smaller safe option.
- Keep `src/app.ts` below 4300 lines. If a task would exceed that, extract a focused controller first.
- Do not put business logic in event-handler wiring.
- Do not mix unrelated refactors in one commit.
- Do not move code and change behavior in the same step.
- Do not add new frameworks or test libraries without a separate decision.
- Do not commit generated build output unless the release process explicitly requires it.
- Do not commit secrets, `.env` values, API keys, tokens, or private customer data.

## Required checks after structural changes

Run at minimum:

```bash
npm run typecheck
npm test
npm run build
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
