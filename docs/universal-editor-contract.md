# Universal Editor Contract

Context-menu input follows the same command and selection owners described here; see `docs/context-menu-contract.md` for the target-selection, availability and accessibility rules.

This document is the ground truth for editor behavior that must work consistently across the application.

It does not describe the current implementation as complete. It defines the target contract for every editable thing in the editor: walls, wall segments, lines, floor boundaries, floor vertices, modules, worktops, custom furniture boards, doors, windows, dimensions, section lines, and generated helper visuals.

## 1. Universal Editor Contract

Every editable object must be registered as an editor entity with a capability profile.

A feature is not editor-complete until its objects define:

- whether they are selectable,
- whether they are deletable,
- whether they are movable,
- whether they are alignable,
- whether they are trimmable or extendable,
- whether they have temporary dimensions,
- whether they can be selected by rectangle selection,
- whether mutations participate in undo/redo.

Global editor features must work from capabilities, not from custom per-mode logic. If a new feature creates editable objects, it must extend the entity registry or adapter system first instead of implementing independent selection, delete, move, align, trim, dimensions, or history behavior.

## 2. Editor Entity

An editor entity is the registered representation of one user-editable object or sub-object.

Required fields:

- `id`: stable editor id, unique inside its layer/context.
- `kind`: one of the supported editor entity kinds.
- `layer/context`: editor scope, for example `layout`, `wall-edit`, `floor-edit`, `custom-furniture`, `section`, `helper`.
- `pickTarget`: object, hit region, or geometric primitive used for pointer picking.
- `visualTarget`: object or visual adapter used for highlight and feedback.
- `domainTarget`: domain object or domain path mutated by commands.
- `capabilities`: declared capability profile.
- `adapter/handler`: implementation of supported commands for this entity.

Supported entity kinds:

- `wall`
- `wall-segment`
- `line`
- `floor-boundary`
- `floor-vertex`
- `module`
- `worktop`
- `custom-furniture-board`
- `door`
- `window`
- `dimension`
- `section-line`
- `helper-generated-visual`

Generated helper visuals are not selectable by default. If a helper becomes user-editable, it must be registered as a real entity kind or explicitly opt into selection capabilities.

## 3. Capabilities

| Capability | Meaning | Used by global command | Entity must implement | If missing |
|---|---|---|---|---|
| `pickable` | Entity can be hit-tested by pointer/raycast/2D geometry. | `Select`, hover, snapping | Pick geometry or pick adapter. | Entity cannot be clicked or hovered directly. |
| `selectable` | Entity can become part of active selection. | `Select`, `ClearSelection` | Selection id, visual highlight target, domain target. | Click may pass through or clear selection. |
| `marqueeSelectable` | Entity can be selected by rectangle selection. | `MarqueeSelection` | Screen bounds or polygon intersection adapter. | Rectangle selection ignores it. |
| `deletable` | Entity can be removed from project/domain state. | `DeleteSelection` | Delete adapter and dependency cleanup rules. | Command ignores or blocks it, depending on delete policy. |
| `movable` | Entity can move while preserving its domain constraints. | `MoveSelection`, drag | Move intent handler, constraints, snap behavior. | Move command skips or blocks it. |
| `alignable` | Entity exposes references for alignment. | `AlignSelection` | `AlignReference[]` provider and alignment mutation adapter. | Entity is not offered as source/target for align. |
| `trimmable` | Entity can be shortened against another reference. | `TrimExtend` | Line-like geometry, trim endpoint rules. | Trim ignores or rejects it. |
| `extendable` | Entity can be lengthened to meet another reference. | `TrimExtend` | Line-like geometry, extend endpoint rules. | Extend ignores or rejects it. |
| `resizable` | Entity can change size through handles/params. | Resize tools, property edits | Resize intent handler and validation. | Resize handles are not shown. |
| `dimensionable` | Entity exposes dimension anchors/references. | `CreateDimension`, dimension tools | Dimension reference provider. | Permanent dimensions cannot target it. |
| `supportsTemporaryDimensions` | Entity can display transient measured feedback. | `ShowTemporaryDimensions` | Temporary dimension references and priority rules. | No temporary dimensions are shown. |
| `undoable` | Mutations must be captured in history. | All mutating commands | Transaction label and snapshot/patch support. | Mutation must not be allowed unless explicitly visual-only. |
| `redoable` | Mutations can be replayed after undo. | `Redo` | Same transaction path as undo. | Redo is unavailable. |
| `snapTarget` | Other entities can snap to it. | Move, draw, align | Snap references and priority. | It is invisible to snapping. |
| `snapSource` | Entity can snap itself to targets. | Move, draw, align | Snap source anchors. | It moves/draws without snapping. |

Capabilities are declarative. A command must check capabilities before mutating anything.

## 4. Global Commands

### Select

Works when the picked entity has `pickable` and `selectable`.

Does not create a history transaction. Selection state is editor UI state unless explicitly persisted as project view state.

If the entity is not selectable, the command should either pass through to a lower pick target or clear selection.

### ClearSelection

Works in every editor mode unless focus is inside text input, modal, menu, or another explicit interaction lock.

Does not create a history transaction.

Shortcut rule: `S` clears selection.

### MarqueeSelection

Works over entities with `marqueeSelectable`.

Does not create a history transaction.

Must use the same entity registry as click selection. It must support mixed entity kinds.

### DeleteSelection

Works over selected entities with `deletable`.

Creates one history transaction for the whole selection delete.

If selected entities include non-deletable items, the product must choose one policy:

- ignore non-deletable entities and delete the rest, or
- block the whole command and show feedback.

This is an open decision.

### MoveSelection

Works over selected entities with `movable`.

Creates one history transaction per committed move operation.

Pointer drag and Move tool must converge on the same move intent/resolver path. Locked/group relationships are handled by the resolver, not by custom drag logic.

### AlignSelection

Works over entities with `alignable`.

Creates a history transaction when it changes domain state.

If selected entities do not provide compatible `AlignReference[]`, command shows feedback and makes no mutation.

### TrimExtend

Works only over entities with `trimmable` or `extendable`.

Creates a history transaction when it changes geometry/domain state.

Fixed parametric modules are not trimmed or extended; they are resized or edited through parameter systems.

### CreateDimension

Works over entities with `dimensionable`.

Creates a history transaction when a persistent dimension is created or changed.

If no valid anchors are available, command shows feedback.

### ShowTemporaryDimensions

Works over hovered or selected entities with `supportsTemporaryDimensions`.

Does not create a history transaction.

Temporary dimensions are derived visuals and must not be stored as independent project state.

### Undo

Works in every editor mode unless an active modal/input owns the shortcut.

Restores the previous project/domain transaction.

Visual-only refresh does not participate in undo.

### Redo

Works in every editor mode unless an active modal/input owns the shortcut.

Reapplies the next project/domain transaction.

### Back/Escape

`Escape` should first cancel the active transient operation, then clear selection, then leave the active mode depending on mode policy.

`Backspace` should map to `DeleteSelection` when the editor canvas owns focus.

Browser Back behavior must be explicitly guarded in project/editor routes.

Exact priority between Back, Escape, and Backspace is an open decision.

### Zoom

Works globally on the active viewer/canvas.

Does not mutate project/domain state and does not create history transactions.

Zoom must not depend on selected entity kind.

## 5. Selection Rules

- Click on a selectable object selects that object.
- Click outside objects always clears selection, except explicit exceptions: focused input, modal, menu, drag handle, active text edit, or locked tool operation.
- `S` clears selection.
- Marquee/selection rectangle uses the same pick registry as click selection.
- Multi-selection must support different entity kinds in the same selection.
- Shift/Ctrl additive selection must be supported by selectable entities where interaction context allows it. Properties for multi-selection should merge editable parameters without duplicate rows: equal values show normally, mixed values show a clear mixed state such as `rozdielne`, and committing a mixed value writes it to every selected entity that owns that parameter.
- Selection highlight must be a unified system driven by selected editor entity ids.
- Hover over a selectable object must show a semi-highlight: visible blue edges only, no face fill.
- Active selection must show a full highlight: visible blue edges plus transparent blue face fill.
- Hover and selection visuals must use each entity's real `visualTarget` geometry. Do not use a 2D footprint-only highlight for 3D objects unless the entity itself is inherently 2D.
- Helper/generated visuals are not selectable unless explicitly user-created and registered as selectable entities.
- Selection state must not require a Three.js object as the source of truth.

## 6. Delete Rules

- `Delete` and `Backspace` over selection trigger global `DeleteSelection`.
- Each selected entity with `deletable` is deleted through its adapter.
- Delete creates exactly one undo transaction for the whole command.
- Delete must not be custom-implemented independently in every editor mode.
- Delete adapters must declare dependency cleanup, for example wall openings, dimensions attached to an entity, generated visuals, or group references.
- Open decision: non-deletable entities in selection should either be ignored or block the whole command.

## 7. Undo/Redo Rules

- Every project/domain mutation must go through a command transaction.
- Undo/redo must work in all editor modes.
- Drawing, deleting, moving, aligning, trimming, extending, resizing, and dimension changes must be undoable.
- Visual-only refresh must not create a history transaction.
- Derived/generated visuals are not stored as separate undo state.
- A command transaction should include a stable label, affected entity ids, before state, after state, and optional validation diagnostics.

## 8. Move Rules

- Move works over every entity with `movable`.
- Pointer drag and Move tool must eventually use the same resolver/intent system.
- Move must not directly mutate Three.js objects as the source of truth.
- Move creates a history transaction when committed.
- Multi-selection move must be consistent across entity kinds.
- Locked/group relationships are resolver responsibilities.
- Failed moves must leave domain state unchanged and provide status feedback.
- During preview, visual objects may move optimistically, but commit/revert must be driven by domain state.

## 9. Align Rules

Align is a universal tool for all `alignable` entities.

Align must not be hardcoded per pair type. Each alignable entity provides `AlignReference[]`.

Reference examples:

Wall:

- centerline
- inner face
- outer face
- endpoints

Line:

- line
- endpoints
- midpoint

Module:

- bounding box faces
- centerlines
- front/back/left/right references

Board:

- edges
- centerlines
- endpoints

Door/window:

- center
- opening edges

Floor:

- boundary segment
- vertex

Align should support:

- wall to wall
- wall to module
- wall to line
- line to line
- module to module
- board to board
- floor edge to wall
- door/window to wall/module/line, where meaningful

If references are incompatible, command must explain that no valid alignment exists.

## 10. Trim/Extend Rules

Trim/Extend works only for line-like or length-like entities.

Supported entity classes:

- walls
- lines
- floor boundary segments
- section lines
- custom furniture boards/edges, if line-like

Unsupported entity classes:

- fixed cabinet modules
- objects with fixed parametric shape contracts

Fixed modules are changed through resize or parameter systems, not Trim/Extend.

Every entity must explicitly declare `trimmable` and/or `extendable`. No command should infer it from geometry alone.

## 11. Temporary Dimensions Rules

Temporary dimensions are a global system, not a custom overlay per tool.

Every dimensionable entity provides:

- dimension anchors,
- edges,
- centerlines,
- bounding references,
- optional nearest references.

When an entity is selected or hovered in a relevant mode, `TemporaryDimensionManager` computes and renders temporary dimensions.

New entities must not implement custom temporary dimensions outside this system.

Temporary dimensions should work for walls, modules, floors, custom furniture, worktops, doors/windows, lines, dimensions, and any other entity where measurement is meaningful.

Open decision: exact hover vs selected priority and density rules.

## 12. Universal Snapping Rules

Snapping is a global editor service. It must not be implemented as separate wall snapping, module snapping, floor snapping, or kitchen snapping.

Every snap-capable entity exports snap geometry through a provider:

- point candidates: endpoints, vertices, centers, insertion points, opening centers, guide anchors,
- segment candidates: wall axes, visible/object edges, section lines, worktop paths, module footprint edges, floor boundaries, guide lines,
- optional plane/face candidates for 3D workflows,
- bindings that can resolve back to current domain state after the object changes.

Snap result priority must be deterministic:

1. explicit intersections and real corners,
2. endpoints and vertices,
3. centers and insertion points,
4. perpendicular projections from the active source point,
5. midpoints,
6. nearest point on object edge/segment,
7. alignment axes and temporary guide lines,
8. grid/length increment fallback.

Tool profiles may narrow or reorder this priority, but they must use the same shared candidates. Examples:

- wall drawing prefers endpoint, intersection, perpendicular, midpoint, then edge,
- measure tools prefer exact points and associative bindings,
- move tools compare selected source anchors against target candidates,
- kitchen placement may add worktop/module adjacency constraints after generic snap candidates.

Snap bindings are part of the contract. A snap that creates an associative measurement or persistent relation must store a binding to the domain object, not just a world coordinate. If the object moves or changes size, resolving the binding must return the updated point.

New editable entities are not snap-complete until they provide snap candidates and binding resolution, or explicitly declare that they are not snap targets.

## 13. Editor Mode Shell

Large editor modes must use a reusable editor mode shell:

- wall drawing
- floor drawing
- custom furniture drawing
- line drawing
- board drawing
- section drawing
- worktop drawing

The shared shell owns:

- top bar
- active tool indicator
- selection
- delete
- move
- align
- trim
- extend
- dimension
- undo
- redo
- zoom
- escape/back behavior
- temporary dimensions
- snapping
- status/help text

Mode-specific behavior should be configuration and adapters, not a separate UI and command system.

## 14. Capability Matrix

| Entity type | pickable | selectable | marqueeSelectable | deletable | movable | alignable | trimmable | extendable | resizable | dimensionable | temporaryDimensions | undoable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Wall | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Wall segment | yes | TODO / Needs decision | yes | TODO / Needs decision | yes | yes | yes | yes | yes | yes | yes | yes |
| Line | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Floor boundary | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Floor vertex | yes | yes | yes | no | yes | yes | no | no | no | yes | yes | yes |
| Module | yes | yes | yes | yes | yes | yes | no | no | yes | yes | yes | yes |
| Worktop | yes | yes | yes | yes | yes | yes | TODO / Needs decision | TODO / Needs decision | yes | yes | yes | yes |
| Custom furniture board | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Door | yes | yes | yes | yes | yes | yes | no | no | yes | yes | yes | yes |
| Window | yes | yes | yes | yes | yes | yes | no | no | yes | yes | yes | yes |
| Dimension | yes | yes | yes | yes | yes | yes | no | no | yes | yes | no | yes |
| Section line | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Helper/generated visual | yes | no by default | no by default | no | no | no | no | no | no | no | no | no |

## 15. Current Code Mapping

### Selection

Files:

- `src/app/selectionController.ts`
- `src/app/pointerInputHandlers.ts`
- `src/app/layoutActionsController.ts`
- `src/app/viewModeController.ts`
- `src/app/wallEditHudUpdater.ts`

Current source of truth is likely `AppState.selectedKind`, selected ids, and controller-local selection state.

Centralization is partial. Risk is high because selection behavior is spread across pointer handling, controllers, and visual highlight updates.

### Marquee selection / selection rectangle

Files:

- `src/app/pointerInputHandlers.ts`

Current source of truth is pointer handler state and custom screen geometry logic.

Centralization is low. Risk is high for new entity types because every entity needs custom rectangle inclusion logic unless a registry is introduced.

### Delete

Files:

- `src/app/keyboardInputHandlers.ts`
- `src/app/layoutActionsController.ts`
- feature controllers for specific objects

Current source of truth is not a single global delete command.

Centralization is low to medium. Risk is high because new entity types may implement delete differently or miss undo.

### Move / drag

Files:

- `src/app/pointerInputHandlers.ts`
- `src/app/modulePlacementHelpers.ts`
- `src/app/wallEditDragController.ts`
- `src/app/floorBoundaryEdit.ts`
- `src/app/customFurnitureController.ts`

Current source of truth is mode-specific.

Centralization is low. Risk is high because pointer drag can diverge from transform move.

### Transform move

Files:

- `src/app/transformController.ts`

Current source of truth for command-style move/rotate is `transformController.ts`.

Centralization is partial. It uses shared placement helpers for modules but still owns restore, validation, wall/opening movement, and last-valid behavior.

### Align

Files:

- `src/app/alignTool.ts`
- `src/app/wallController.ts`
- `src/app/measureSelectionActions.ts`
- `src/app/technicalDimensions.ts`

Current source of truth is align helper functions and controller-specific candidate builders.

Centralization is partial. Risk is medium-high because supported pairs depend on available candidate builders.

### Trim / extend

Files:

- `src/app/wallController.ts`
- `src/app/pointerInputHandlers.ts`

Current source of truth appears wall/tool-specific.

Centralization is low. Risk is high when adding lines, floor edges, section lines, or custom board edges.

### Temporary dimensions

Files:

- `src/app/measureTools.ts`
- `src/app/measure3d.ts`
- `src/app/measureAssociative.ts`
- `src/app/measureSelectionActions.ts`
- `src/app/dimensionOverlay.ts`
- window/door/worktop/wall visual controllers

Current source of truth is fragmented between measure systems and visual controllers.

Centralization is low. Risk is high for inconsistent dimensions.

### Undo / redo

Files:

- `src/layout/historyManager.ts`
- `src/app/keyboardInputHandlers.ts`
- controllers that call `commitHistory`

Current source of truth is layout snapshots in `historyManager.ts`.

Centralization is medium. Risk is high because not every mutation necessarily goes through one command transaction.

### Zoom

Files:

- `src/core/scene.ts`
- `src/app/viewNavigation.ts`
- `src/app/pointerInputHandlers.ts`

Current source of truth is viewer/camera controller behavior.

Centralization is partial. Risk is medium, mostly around mode-specific viewer focus.

### Editor toolbar / top bar

Files:

- `src/ui/createTopbar.ts`
- `src/ui/createRibbon.ts`
- `src/app/classicTopbarController.ts`
- `src/app/viewModeController.ts`
- `src/app/workspaceNavigationController.ts`

Current source of truth is UI shell plus app controllers.

Centralization is partial. Risk is medium because modes can grow separate toolbar behavior.

### Wall drawing editor

Files:

- `src/app/wallController.ts`
- `src/app/pointerInputHandlers.ts`
- `src/app/wallEditDragController.ts`
- `src/app/wallEditHudUpdater.ts`

Current source of truth is wall controller plus pointer handler.

Centralization is low. Risk is high.

### Floor drawing editor

Files:

- `src/app/floorBoundaryController.ts`
- `src/app/floorBoundaryEdit.ts`
- `src/app/floorBoundaryVisuals.ts`
- `src/app/floorController.ts`
- `src/app/pointerInputHandlers.ts`

Current source of truth is floor-specific controllers.

Centralization is partial. Risk is medium-high.

### Custom furniture editor

Files:

- `src/app/customFurnitureController.ts`
- `src/layout/customFurnitureTypes.ts`
- `src/layout/customFurnitureGeometry.ts`
- `src/layout/bom/customFurniturePricing.ts`

Current source of truth is custom furniture controller and custom geometry types.

Centralization is partial. Risk is medium-high because custom boards should share selection/move/align/dimension contracts.

## 16. Future Implementation Plan

### Faza 0: document and capability matrix

Create and maintain this document as the contract for editor features.

### Faza 1: audit existing tools/commands

List all current commands, shortcuts, mode-specific delete/move/align/dimension behavior, and current entity types.

### Faza 2: create read-only editor registry

Introduce a registry that only reports entities and capabilities. It must not change behavior.

### Faza 3: add characterization tests

Add tests for current behavior:

- selection,
- deselection,
- delete,
- move,
- align,
- temporary dimensions,
- undo/redo.

### Faza 4: connect DeleteSelection through registry

Start with one low-risk entity type. Keep behavior identical and compare with characterization tests.

### Faza 5: connect TemporaryDimensionManager

Start read-only with walls/modules. Then extend to floors, worktops, doors/windows, custom furniture, and lines.

### Faza 6: unify Move/Drag/Transform Move

Introduce move intents and a resolver. Route one workflow at a time.

### Faza 7: unify Align

Replace pair-specific align logic with `AlignReference[]` providers.

### Faza 8: unify EditorModeShell

Move shared mode UI into a reusable shell. Migrate modes one at a time.

## 17. Non-goals

This document does not require immediate runtime changes.

Do not use this contract as permission for a big-bang refactor. Every implementation step must be small, tested, and behavior-preserving unless a behavior change is explicitly approved.
