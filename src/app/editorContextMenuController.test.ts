// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createContextMenuController } from "../ui/contextMenu";
import { createEditorContextMenuController, type EditorContextMenuState } from "./editorContextMenuController";

function setup(overrides: Partial<EditorContextMenuState> = {}) {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  let state: EditorContextMenuState = {
    mode: "layout",
    viewMode: "2d",
    layoutTool: "select",
    selectionKind: "module",
    selectionCount: 1,
    hasHiddenObjects: false,
    selectedHasHidden: false,
    activeCommand: null,
    ...overrides
  };
  const menu = createContextMenuController({ document, window });
  const callbacks = {
    openProperties: vi.fn(), openViewProperties: vi.fn(), moveSelection: vi.fn(), rotateSelection: vi.fn(),
    duplicateSelection: vi.fn(), deleteSelection: vi.fn(), editFloorBoundary: vi.fn(), openUnderlayProperties: vi.fn(),
    hideSelection: vi.fn(), unhideSelection: vi.fn(), isolateSelection: vi.fn(), unhideAll: vi.fn(), undo: vi.fn(), redo: vi.fn(), resetView: vi.fn()
  };
  const controller = createEditorContextMenuController({
    canvas,
    menu,
    getState: () => state,
    resolveCanvasTarget: vi.fn(() => state.selectionKind ? { kind: state.selectionKind, id: "selected" } : null),
    ...callbacks
  });
  return { canvas, callbacks, controller, menu, setState: (next: EditorContextMenuState) => { state = next; } };
}

describe("editor context menu", () => {
  it("shows only operations supported by the selected entity", () => {
    const module = setup();
    module.canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-context-menu-action='move']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='rotate']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='duplicate']")).not.toBeNull();
    module.menu.destroy();
    document.body.innerHTML = "";

    const floor = setup({ selectionKind: "floor" });
    floor.canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-context-menu-action='edit-floor-boundary']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='move']")).toBeNull();
    expect(document.querySelector("[data-context-menu-action='duplicate']")).toBeNull();
    floor.menu.destroy();
  });

  it("switches to the active command menu and exposes only real command callbacks", () => {
    const cancel = vi.fn();
    const toggle = vi.fn();
    const fixture = setup({
      activeCommand: { id: "move", label: "Move", cancel, snap: { enabled: true, toggle } }
    });
    fixture.canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-context-menu-action='cancel-command']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='toggle-snap']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='finish-command']")).toBeNull();
    expect(document.querySelector("[data-context-menu-action='delete']")).toBeNull();
    fixture.menu.destroy();
  });

  it("shows global actions for blank editor space", () => {
    const fixture = setup({ selectionKind: null, selectionCount: 0, hasHiddenObjects: true });
    fixture.canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-context-menu-action='undo']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='redo']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='unhide-all']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='reset-view']")).not.toBeNull();
    fixture.menu.destroy();
  });
});
