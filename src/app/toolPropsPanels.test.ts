import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlignPickedLine } from "./localTypes";
import { mountAlignToolPropsPanel, mountKitchenWorktopToolPropsPanel, mountTrimToolPropsPanel } from "./toolPropsPanels";
import type { AppState } from "../layout/appState";
import { installFakeDocument, makePropertiesPanelHarness } from "./testUtils/propertiesPanelHarness";

function pickedLine(label: string) {
  return { label } as AlignPickedLine;
}

describe("tool props panels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps align tool muted hint and reference summary text", () => {
    installFakeDocument();
    const { props, section } = makePropertiesPanelHarness();

    mountAlignToolPropsPanel({ props, alignState: { ref: pickedLine("Wall A") } });

    expect(props.setTitle).toHaveBeenCalledWith("Align");
    expect(section.children.map((child) => child.className)).toEqual(["muted", "muted"]);
    expect(section.children[0]?.textContent).toBe("Click the reference line, then click one or more parallel lines to align. Esc = new reference, Esc again = exit.");
    expect(section.children[1]?.textContent).toBe("Reference: Wall A");
    expect(section.children[1]?.style.marginTop).toBe("8px");
  });

  it("keeps trim tool muted hint, step, and target summary text", () => {
    installFakeDocument();
    const { props, section } = makePropertiesPanelHarness();

    mountTrimToolPropsPanel({
      props,
      trimState: { step: "pickCutter", targetPick: pickedLine("Target wall") }
    });

    expect(props.setTitle).toHaveBeenCalledWith("Trim / Extend");
    expect(section.children.map((child) => child.className)).toEqual(["muted", "muted", "muted"]);
    expect(section.children[0]?.textContent).toBe("Click the target wall, then click the boundary wall or line. The nearest end trims or extends to the intersection. Esc = back.");
    expect(section.children[1]?.textContent).toBe("Step: select cut");
    expect(section.children[1]?.style.marginTop).toBe("8px");
    expect(section.children[2]?.textContent).toBe("Target: Target wall");
    expect(section.children[2]?.style.marginTop).toBe("6px");
  });

  it("keeps worktop tool read-only rows and justification change behavior", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const scheduleKitchenWorktopPreviewUpdate = vi.fn();
    const kitchenWorktopDraw = { justification: "back" as const };

    mountKitchenWorktopToolPropsPanel({
      props,
      S: {
        kitchenCtx: {
          worktopDepthMm: 620,
          worktopThicknessMm: 38,
          heightMm: 910,
          worktopMaterialId: "mat-oak"
        }
      } as AppState,
      kitchenWorktopDraw,
      scheduleKitchenWorktopPreviewUpdate,
      getMaterialDefinitionById: (id) => (id === "mat-oak" ? { displayName: "Oak laminate" } : null)
    });

    expect(props.setTitle).toHaveBeenCalledWith("Worktop");
    expect(rows.map((row) => [row.label, row.control.textContent])).toEqual([
      ["Justification", ""],
      ["Depth", "620 mm"],
      ["Thickness", "38 mm"],
      ["Top Height", "910 mm"],
      ["Material", "Oak laminate"]
    ]);
    expect(rows[0]!.control.value).toBe("back");
    expect(rows[0]!.control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["center", "Center"],
      ["back", "Back edge"],
      ["front", "Front edge"]
    ]);
    expect(section.children.at(-1)?.className).toBe("muted");

    rows[0]!.control.value = "front";
    rows[0]!.control.dispatch("change");

    expect(kitchenWorktopDraw.justification).toBe("front");
    expect(scheduleKitchenWorktopPreviewUpdate).toHaveBeenCalledOnce();
  });
});
