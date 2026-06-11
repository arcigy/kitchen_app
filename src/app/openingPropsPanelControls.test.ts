import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendOpeningHandleRows,
  appendOpeningMaterialRow,
  appendOpeningNumberRows,
  appendOpeningSwingRows
} from "./openingPropsPanelControls";
import { installFakeDocument, makePropertiesPanelHarness } from "./testUtils/propertiesPanelHarness";

describe("opening props panel controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies number rows on input, change, and Enter without changing commit timing", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const params = { widthMm: 900 };
    const apply = vi.fn();

    appendOpeningNumberRows(props, section, params, [{ label: "Width", key: "widthMm" }], apply);

    const width = rows[0].control;
    expect(width.type).toBe("number");
    expect(width.step).toBe("1");
    expect(width.value).toBe("900");

    width.value = "925.4";
    width.dispatch("input");
    expect(params.widthMm).toBe(925);
    expect(apply).toHaveBeenLastCalledWith(false, { widthMm: 925 });

    width.value = "930.6";
    width.dispatch("change");
    expect(params.widthMm).toBe(931);
    expect(apply).toHaveBeenLastCalledWith(true, { widthMm: 931 });

    width.value = "940";
    width.dispatch("keydown", { key: "Enter" });
    expect(apply).toHaveBeenLastCalledWith(true, { widthMm: 940 });
  });

  it("toggles opening swing controls through shared button and select behavior", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const params = { swingDirection: "right" as const, swingSide: "outward" as const };
    const apply = vi.fn();

    appendOpeningSwingRows(props, section, params, apply, {
      controlsRow: "Sipky",
      directionRow: "Otvaranie",
      sideRow: "Smer",
      handednessButton: "Prehodit lave/prave dvere",
      sideButton: "Prehodit otvaranie dovnutra/von",
      handednessToLeft: "Prehodit na lave dvere",
      handednessToRight: "Prehodit na prave dvere",
      sideToInward: "Prehodit otvaranie dovnutra",
      sideToOutward: "Prehodit otvaranie von",
      includeButtonAriaLabel: true
    });

    const [handednessButton, sideButton] = rows[0].control.children;
    expect(handednessButton.type).toBe("button");
    expect(handednessButton.className).toBe("door-swing-button");
    expect(handednessButton.innerHTML).toBe("&#8596;");
    expect(handednessButton.title).toBe("Prehodit na lave dvere");
    expect(handednessButton.attributes.get("aria-label")).toBe("Prehodit lave/prave dvere");
    expect(sideButton.type).toBe("button");
    expect(sideButton.className).toBe("door-swing-button");
    expect(sideButton.innerHTML).toBe("&#8597;");
    expect(rows[1].control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["left", "Lave"],
      ["right", "Prave"]
    ]);
    expect(rows[2].control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["inward", "Dovnutra"],
      ["outward", "Von"]
    ]);

    handednessButton.dispatch("click");
    expect(params.swingDirection).toBe("left");
    expect(apply).toHaveBeenLastCalledWith(true, { swingDirection: "left" });

    sideButton.dispatch("click");
    expect(params.swingSide).toBe("inward");
    expect(apply).toHaveBeenLastCalledWith(true, { swingSide: "inward" });

    const direction = rows[1].control;
    direction.value = "right";
    direction.dispatch("change");
    expect(params.swingDirection).toBe("right");
    expect(apply).toHaveBeenLastCalledWith(true, { swingDirection: "right" });
  });

  it("keeps opening handle rows centralized and clamps negative numeric values", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const params = { handleType: "lever" as const, handleHeightMm: 900, handleOffsetMm: 50 };
    const apply = vi.fn();

    appendOpeningHandleRows(props, section, params, apply);

    const handleType = rows.find((row) => row.label === "Typ klucky")?.control;
    expect(handleType?.children.map((child) => [child.value, child.textContent])).toEqual([
      ["lever", "Paka"],
      ["knob", "Gula"],
      ["bar", "Madlo"],
      ["none", "Bez klucky"]
    ]);

    const height = rows.find((row) => row.label === "Vyska klucky (mm)")?.control;
    expect(height).toBeDefined();
    height!.value = "-12";
    height!.dispatch("change");

    expect(params.handleHeightMm).toBe(0);
    expect(apply).toHaveBeenLastCalledWith(true, { handleHeightMm: 0 });
  });

  it("applies opening material changes and supports door-style normalization", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const params = { materialId: "invalid" };
    const apply = vi.fn();

    appendOpeningMaterialRow(
      props,
      section,
      params,
      [
        { id: "mat-a", name: "A" },
        { id: "mat-b", name: "B" }
      ],
      apply,
      { normalize: (value) => (value === "mat-b" ? "mat-b" : "mat-a") }
    );

    const material = rows[0].control;
    expect(material.children.map((child) => [child.value, child.textContent])).toEqual([
      ["mat-a", "A"],
      ["mat-b", "B"]
    ]);
    expect(params.materialId).toBe("mat-a");
    expect(material.value).toBe("mat-a");

    material.value = "mat-b";
    material.dispatch("change");

    expect(params.materialId).toBe("mat-b");
    expect(apply).toHaveBeenLastCalledWith(true, { materialId: "mat-b" });
  });
});
