import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeElement, installFakeDocument } from "../app/testUtils/propertiesPanelHarness";
import { createPartPanel, type OverlapRow, type PartRow } from "./createPartPanel";

function partRow(name: string, visible = true): PartRow {
  return {
    name,
    visible,
    dimensionsMm: { width: 1000, height: 500, depth: 18 },
    grainAlong: "width"
  };
}

function overlapRow(status: "error" | "allowed" = "error"): OverlapRow {
  return {
    a: "Side",
    b: "Shelf",
    status,
    reason: status === "allowed" ? "manual" : undefined,
    overlapMm: { x: 10, y: 20, z: 30 },
    intersectionMm: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    aBoxMm: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    bBoxMm: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    volumeMm3: 1
  };
}

describe("createPartPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps selected, row, material, and overlap controls wired", () => {
    installFakeDocument();
    const container = new FakeElement() as FakeElement & HTMLElement;
    const onSelect = vi.fn();
    const onSetVisible = vi.fn();
    const onHighlightPair = vi.fn();
    const onSetMaterialOverride = vi.fn();

    const panel = createPartPanel(container, {
      onSelect,
      onSetVisible,
      onHighlightPair,
      isMaterialOverrideEnabled: (name) => name === "Side",
      getMaterialOverride: () => "MDF",
      onSetMaterialOverride
    });

    const selected = container.children[0]!;
    const selectedBtn = selected.children[2]!;
    const materialWrap = selected.children[3]!;
    const materialSelect = materialWrap.children[1]!;
    expect(selectedBtn.type).toBe("button");
    expect(selectedBtn.disabled).toBe(true);
    expect(selectedBtn.textContent).toBe("Hide selected");
    expect(materialSelect.id).toBe("selectedPartMaterialOverride");
    expect(materialSelect.children.map((child) => child.value)).toEqual(["", "DTD1", "DTD2", "DTD3", "MDF", "DVD", "DTD16"]);

    panel.setRows([partRow("Side", true), partRow("Shelf", false)]);
    panel.setSelected("Side");

    expect(selectedBtn.disabled).toBe(false);
    expect(selectedBtn.textContent).toBe("Hide selected");
    expect(materialWrap.style.display).toBe("");
    expect(materialSelect.value).toBe("MDF");

    materialSelect.value = "DVD";
    materialSelect.dispatch("change");
    expect(onSetMaterialOverride).toHaveBeenCalledWith("Side", "DVD");

    selectedBtn.click();
    expect(onSetVisible).toHaveBeenCalledWith("Side", false);

    const list = container.children[1]!;
    const sideItem = list.children[1]!;
    const rowCheck = sideItem.children[0]!;
    const rowButton = sideItem.children[1]!.children[0]!;
    expect(rowCheck.type).toBe("checkbox");
    expect(rowCheck.checked).toBe(true);
    expect(rowButton.type).toBe("button");
    expect(rowButton.className).toBe("label");
    rowCheck.checked = false;
    rowCheck.dispatch("change");
    rowButton.click();
    expect(onSetVisible).toHaveBeenLastCalledWith("Side", false);
    expect(onSelect).toHaveBeenCalledWith("Side");

    panel.setOverlaps([overlapRow("error"), overlapRow("allowed")]);
    const overlaps = container.children[2]!;
    const showAllowed = overlaps.children[0]!.children[1]!.children[0]!;
    const overlapsList = overlaps.children[1]!;
    expect(showAllowed.type).toBe("checkbox");
    expect(overlapsList.children).toHaveLength(1);

    showAllowed.checked = true;
    showAllowed.dispatch("change");
    expect(overlapsList.children).toHaveLength(2);
    const highlightButton = overlapsList.children[0]!.children[1]!;
    expect(highlightButton.type).toBe("button");
    expect(highlightButton.textContent).toBe("Highlight");
    highlightButton.click();
    expect(onHighlightPair).toHaveBeenCalledWith("Side", "Shelf");
  });
});
