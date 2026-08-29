# Arcigy context-menu contract

Arcigy uses one application-owned context-menu surface. A menu item is permitted only when it calls an existing typed owner or a focused adapter covered by a regression test. Unsupported actions are omitted. Temporarily unavailable actions remain visible only when the reason helps the user and must expose that reason while disabled.

## Input and selection behavior

- Text inputs, textareas, search fields and contenteditable regions keep the browser's native Cut/Copy/Paste menu.
- Right-clicking an object resolves the target through the editor's existing raycast and floor-plan hit geometry.
- An unselected target becomes the current selection before its menu is built.
- Right-clicking an object already inside a module or wall multi-selection preserves the whole selection.
- Right-clicking blank editor space opens global project/view actions without silently changing the current selection.
- During an active editor command, the command menu replaces object/global actions. It exposes only the finish, cancel, snap or ortho callbacks actually owned by that command.

## Owned action surfaces

| Surface | Real actions |
| --- | --- |
| Layout selection | Properties; supported Move/Rotate/Duplicate; floor boundary edit; underlay settings; Hide/Unhide/Isolate; Delete |
| Blank layout/application area | Undo, Redo, Unhide all when applicable, Reset view, View properties, Save project |
| Module catalog | Place module; draw worktop; disabled reason when kitchen editing is inactive |
| Project card | Open, export `.fqp`, saved versions, role-gated delete through the existing confirmation dialog |
| Project version | Preview and restore through the existing restore confirmation |
| Materials general | Material properties/usage focus, enabled supplier launchers, reset to tenant default |
| Materials module/addition item | Open General assignment, create a project override from General, remove the override and inherit General |
| Margins | Focus/edit group or item, apply group value, reset group/item override, focus project default/additional labor |
| Schedules | Open a source module when one exists, copy the row, open Materials, open Margins |

Project material context actions never edit the tenant catalog. Scope copies preserve the complete frozen assignment snapshot. Scope removal is an additive revision-safe API operation and rejects deletion of General settings assignments.

## Menu lifecycle and accessibility

The controller renders one `role="menu"` root, clamps it to the viewport, closes it on outside pointer input, scroll, resize or Escape, supports Context Menu / Shift+F10 plus arrow-key navigation, and prevents duplicate execution while an asynchronous action is pending. Nested providers fall back to their parent provider when they have no contextual action.
