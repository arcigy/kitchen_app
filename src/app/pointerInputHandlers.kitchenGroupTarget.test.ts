import { describe, expect, it } from "vitest";
import { resolveKitchenDoubleClickAction, resolveKitchenGroupEditTarget, shouldStartLayoutMarqueeSelection } from "./pointerInputHandlers";

describe("kitchen group edit target resolution", () => {
  it("preserves the clicked module id so a saved tall custom module can reopen its module editor", () => {
    const target = resolveKitchenGroupEditTarget({
      moduleGroupId: "group-1",
      moduleInstanceId: "tall-module-1",
      worktopGroupId: null,
      isKnownGroup: (groupId) => groupId === "group-1"
    });

    expect(target).toEqual({ groupId: "group-1", focusInstanceId: "tall-module-1" });
  });

  it("opens a known group without module focus when only the worktop is hit", () => {
    const target = resolveKitchenGroupEditTarget({
      moduleGroupId: null,
      moduleInstanceId: null,
      worktopGroupId: "group-1",
      isKnownGroup: (groupId) => groupId === "group-1"
    });

    expect(target).toEqual({ groupId: "group-1", focusInstanceId: null });
  });

  it("ignores unknown kitchen groups", () => {
    const target = resolveKitchenGroupEditTarget({
      moduleGroupId: "missing-group",
      moduleInstanceId: "tall-module-1",
      worktopGroupId: null,
      isKnownGroup: () => false
    });

    expect(target).toBeNull();
  });
});

describe("kitchen double click editor routing", () => {
  it("opens the kitchen group first when double-clicking a grouped module from the layout", () => {
    expect(resolveKitchenDoubleClickAction({
      target: { groupId: "group-1", focusInstanceId: "tall-module-1" },
      kitchenEditMode: false,
      activeKitchenGroupId: null,
      moduleEditorActive: false
    })).toEqual({
      type: "open-group",
      target: { groupId: "group-1", focusInstanceId: "tall-module-1" }
    });
  });

  it("opens the module editor only on a second double-click inside the active kitchen group", () => {
    expect(resolveKitchenDoubleClickAction({
      target: { groupId: "group-1", focusInstanceId: "tall-module-1" },
      kitchenEditMode: true,
      activeKitchenGroupId: "group-1",
      moduleEditorActive: false
    })).toEqual({ type: "open-module-editor", instanceId: "tall-module-1" });
  });

  it("does not reopen the module editor while already inside the module editor", () => {
    expect(resolveKitchenDoubleClickAction({
      target: { groupId: "group-1", focusInstanceId: "tall-module-1" },
      kitchenEditMode: true,
      activeKitchenGroupId: "group-1",
      moduleEditorActive: true
    })).toBeNull();
  });
});

describe("layout marquee selection start", () => {
  const base = {
    floorEditActive: false,
    isColumnPlacementActive: false,
    isDoorPlacementActive: false,
    isWindowPlacementActive: false,
    layoutTool: "select",
    measureEnabled: false,
    mode: "layout",
    placementActive: false,
    transformActive: false
  };

  it("starts with the primary pointer button and not the secondary button", () => {
    expect(shouldStartLayoutMarqueeSelection({ ...base, button: 0 })).toBe(true);
    expect(shouldStartLayoutMarqueeSelection({ ...base, button: 2 })).toBe(false);
  });

  it("does not start while another transient editor operation owns the pointer", () => {
    expect(shouldStartLayoutMarqueeSelection({ ...base, button: 0, placementActive: true })).toBe(false);
    expect(shouldStartLayoutMarqueeSelection({ ...base, button: 0, transformActive: true })).toBe(false);
    expect(shouldStartLayoutMarqueeSelection({ ...base, button: 0, layoutTool: "move" })).toBe(false);
  });
});
